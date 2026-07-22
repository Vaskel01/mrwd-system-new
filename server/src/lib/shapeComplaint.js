// The complaints table (and its related tables) use different column
// names than the frontend was originally written against. Rather than
// touch every page component, we reshape rows here, once, into the
// shape the frontend already expects:
//
//   DB column                  → frontend field
//   ─────────────────────────────────────────────
//   resident_id                → customer_id
//   category_id (joined name)  → complaint_type
//   address_text               → address
//   lat, lng                   → gps: { lat, lng }
//   submitted_at                → created_at
//   (joined profiles.full_name) → customer_name
//   (joined maintenance_tasks)  → assigned_to, assigned_name, task_notes
//   (computed)                  → similar_ids, similar_count (possible duplicates)

// Statuses still considered "active work" for duplicate-detection
// purposes — no point flagging two reports as duplicates of each
// other if one's already closed out.
const ACTIVE_STATUSES = new Set(['pending', 'assigned', 'en_route', 'in_progress'])
const DUPLICATE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

/**
 * Fetches complaint rows plus everything needed to join them, and
 * returns them reshaped for the frontend. `filterFn` lets a caller
 * further narrow the query (e.g. `.eq('id', id)`) before it runs.
 */
export async function fetchShapedComplaints(supabase, { filter } = {}) {
  let query = supabase.from('complaints').select('*').order('submitted_at', { ascending: false })
  if (filter) query = filter(query)

  const { data: rows, error } = await query
  if (error) throw error
  if (!rows.length) return []

  const categoryIds = [...new Set(rows.map(r => r.category_id).filter(Boolean))]
  const residentIds = [...new Set(rows.map(r => r.resident_id).filter(Boolean))]
  const complaintIds = rows.map(r => r.id)

  const [{ data: categories }, { data: tasks }] = await Promise.all([
    categoryIds.length
      ? supabase.from('complaint_categories').select('id, name').in('id', categoryIds)
      : { data: [] },
    complaintIds.length
      ? supabase.from('maintenance_tasks').select('*').in('complaint_id', complaintIds).order('created_at', { ascending: false })
      : { data: [] },
  ])

  const categoryMap = Object.fromEntries((categories || []).map(c => [c.id, c.name]))

  // Most recent task per complaint (tasks already ordered newest-first)
  const taskMap = {}
  for (const t of tasks || []) {
    if (!taskMap[t.complaint_id]) taskMap[t.complaint_id] = t
  }

  // Need names for both residents (customer_name) and whoever's
  // assigned (assigned_name) — fetch both sets of profiles together.
  const assignedStaffIds = Object.values(taskMap).map(t => t.assigned_staff_id).filter(Boolean)
  const profileIds = [...new Set([...residentIds, ...assignedStaffIds])]
  const { data: profiles } = profileIds.length
    ? await supabase.from('profiles').select('id, full_name').in('id', profileIds)
    : { data: [] }
  const profileMap = Object.fromEntries((profiles || []).map(p => [p.id, p.full_name]))

  const shaped = rows.map(row => shapeOne(row, categoryMap, profileMap, taskMap))
  return flagPossibleDuplicates(shaped)
}

export async function fetchShapedComplaintById(supabase, id) {
  const results = await fetchShapedComplaints(supabase, { filter: q => q.eq('id', id) })
  return results[0] || null
}

// Removes classifier internals from non-admin API responses. Customers do
// not receive any classifier output. Assigned maintenance personnel only
// receive the final operational category and priority needed to perform work.
export function presentComplaintForRole(complaint, role) {
  if (!complaint || role === 'admin') return complaint

  const presented = { ...complaint }
  const internalFields = [
    'priority_score',
    'rule_score',
    'sentiment_score',
    'classification_confidence',
    'classification_sentiment',
    'classification_mismatch',
    'classification_basis',
    'classification_keywords',
    'classification_negated_keywords',
    'classification_reasons',
    'classifier_version',
    'classification_method',
  ]

  for (const field of internalFields) delete presented[field]

  if (role === 'customer') {
    delete presented.priority
    delete presented.classified_category
  }

  return presented
}

function shapeOne(row, categoryMap, profileMap, taskMap) {
  const task = taskMap[row.id]
  return {
    id: row.id,
    customer_id: row.resident_id,
    customer_name: profileMap[row.resident_id] || 'Unknown',
    complaint_type: categoryMap[row.category_id] || 'Unknown',
    description: row.description,
    address: row.address_text,
    photo_urls: Array.isArray(row.photo_urls) ? row.photo_urls : [],
    photo_url: Array.isArray(row.photo_urls) ? (row.photo_urls[0] || null) : null,
    zone: row.zone,
    gps: (row.lat != null && row.lng != null) ? { lat: row.lat, lng: row.lng, accuracy: null } : null,
    status: row.status,
    rejection_reason: row.rejection_reason || null,
    rejected_at: row.rejected_at || null,
    priority: row.priority,
    priority_score: row.priority_score,
    rule_score: row.rule_score,
    sentiment_score: row.sentiment_score,
    classified_category: row.classified_category || categoryMap[row.category_id] || 'Unknown',
    classification_confidence: row.classification_confidence == null ? null : Number(row.classification_confidence),
    classification_sentiment: row.classification_sentiment || null,
    classification_mismatch: Boolean(row.classification_mismatch),
    classification_basis: row.classification_basis || null,
    classification_keywords: Array.isArray(row.classification_keywords) ? row.classification_keywords : [],
    classification_negated_keywords: Array.isArray(row.classification_negated_keywords) ? row.classification_negated_keywords : [],
    classification_reasons: Array.isArray(row.classification_reasons) ? row.classification_reasons : [],
    classifier_version: row.classifier_version || null,
    classification_method: row.classification_method || null,
    assigned_to: task ? task.assigned_staff_id : null,
    assigned_name: task ? (profileMap[task.assigned_staff_id] || 'Unassigned staff') : null,
    task_status: task ? task.status : null,
    task_notes: task ? task.notes : null,
    task_created_at: task ? task.created_at : null,
    task_updated_at: task ? task.updated_at : null,
    completed_at: task ? task.completed_at : null,
    created_at: row.submitted_at,
    updated_at: row.updated_at,
  }
}

// Groups still-active complaints by (type + location) and flags any
// group with more than one member as possible duplicates of each
// other — e.g. five residents on the same street all reporting "no
// water" within a day of each other. Location grouping falls back to
// the free-text address when no zone is set, since the current
// submission form doesn't collect a zone value.
function flagPossibleDuplicates(shaped) {
  const groups = {}
  for (const c of shaped) {
    if (!ACTIVE_STATUSES.has(c.status)) continue
    const locationKey = (c.zone || c.address || '').toLowerCase().trim()
    if (!locationKey) continue
    const key = `${c.complaint_type}::${locationKey}`
    ;(groups[key] ||= []).push(c)
  }

  for (const group of Object.values(groups)) {
    if (group.length < 2) continue
    for (const c of group) {
      const related = group.filter(o =>
        o.id !== c.id &&
        Math.abs(new Date(o.created_at) - new Date(c.created_at)) <= DUPLICATE_WINDOW_MS
      )
      if (related.length > 0) {
        c.similar_count = related.length
        c.similar_ids = related.map(r => r.id)
      }
    }
  }

  return shaped
}

