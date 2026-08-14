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
const ACTIVE_STATUSES = new Set(['pending', 'forwarded', 'assigned', 'en_route', 'in_progress', 'blocked', 'awaiting_verification'])
const DUPLICATE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

/**
 * Fetches complaint rows plus everything needed to join them, and
 * returns them reshaped for the frontend. `filterFn` lets a caller
 * further narrow the query (e.g. `.eq('id', id)`) before it runs.
 */
export async function fetchShapedComplaints(supabase, { filter, includeArchived = false } = {}) {
  let query = supabase.from('complaints').select('*').order('submitted_at', { ascending: false })
  if (!includeArchived) query = query.is('archived_at', null)
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

  // Current assignment per complaint. Once the workflow migration has
  // introduced is_active, inactive historical rows must never look assigned.
  // The fallback to the newest row is only for a genuinely pre-migration DB.
  const taskRows = tasks || []
  const hasAssignmentState = taskRows.some(task => typeof task.is_active === 'boolean')
  const taskMap = {}
  for (const task of taskRows) {
    if (hasAssignmentState) {
      if (task.is_active === true && !taskMap[task.complaint_id]) taskMap[task.complaint_id] = task
    } else if (!taskMap[task.complaint_id]) {
      taskMap[task.complaint_id] = task
    }
  }

  // Need names for both residents (customer_name) and whoever's
  // assigned (assigned_name) — fetch both sets of profiles together.
  const assignedStaffIds = Object.values(taskMap).map(t => t.assigned_staff_id).filter(Boolean)
  const profileIds = [...new Set([...residentIds, ...assignedStaffIds])]
  let profiles = []
  if (profileIds.length) {
    const visibleResult = await supabase.rpc('visible_profile_names', { p_ids: profileIds })
    if (!visibleResult.error) {
      profiles = visibleResult.data || []
    } else {
      // Compatibility fallback while the final migration has not been run yet.
      const fallback = await supabase.from('profiles').select('id, full_name').in('id', profileIds)
      profiles = fallback.data || []
    }
  }
  const profileMap = Object.fromEntries(profiles.map(p => [p.id, p.full_name]))

  const shaped = rows.map(row => shapeOne(row, categoryMap, profileMap, taskMap))
  return flagPossibleDuplicates(shaped)
}

export async function fetchShapedComplaintById(supabase, id) {
  const results = await fetchShapedComplaints(supabase, { filter: q => q.eq('id', id), includeArchived: true })
  return results[0] || null
}

// Removes classifier internals from non-admin API responses. Customers do
// not receive any classifier output. Assigned maintenance personnel only
// receive the final operational category and priority needed to perform work.
export function presentComplaintForRole(complaint, role, { canViewClassifier = role === 'admin' } = {}) {
  if (!complaint || (role === 'admin' && canViewClassifier)) return complaint

  const presented = { ...complaint }
  const internalFields = [
    'priority_score',
    'algorithm_priority_score',
    'priority_override_reason',
    'priority_overridden_by',
    'priority_overridden_at',
    'priority_is_overridden',
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

  // ECMD can see the operational override state/reason without receiving the
  // classifier's internal score breakdown or model evidence.
  if (role === 'admin' && !canViewClassifier) {
    presented.priority_override_reason = complaint.priority_override_reason || null
    presented.priority_overridden_at = complaint.priority_overridden_at || null
    presented.priority_is_overridden = Boolean(complaint.priority_overridden_at)
  }

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
    reference_number: row.reference_number || `MRWD-${String(row.id).slice(0, 8).toUpperCase()}`,
    customer_id: row.resident_id,
    customer_name: profileMap[row.resident_id] || 'Customer profile unavailable',
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
    algorithm_priority_score: row.algorithm_priority_score ?? row.priority_score,
    priority_override_reason: row.priority_override_reason || null,
    priority_overridden_by: row.priority_overridden_by || null,
    priority_overridden_at: row.priority_overridden_at || null,
    priority_is_overridden: Boolean(row.priority_overridden_at),
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
    task_id: task ? task.id : null,
    assigned_crew_id: task ? task.assigned_crew_id : null,
    assigned_name: task ? (profileMap[task.assigned_staff_id] || 'Unassigned staff') : null,
    task_status: task ? task.status : null,
    task_notes: task ? task.notes : null,
    task_created_at: task ? task.created_at : null,
    assigned_at: task ? task.created_at : null,
    task_updated_at: task ? task.updated_at : null,
    task_is_active: task ? task.is_active !== false : false,
    completion_notes: task ? task.completion_notes : null,
    materials_used: task ? task.materials_used : null,
    unable_reason: task ? task.unable_reason : null,
    reassignment_requested_at: task ? task.reassignment_requested_at : null,
    reassignment_reason: task ? task.reassignment_reason : null,
    assistance_requested_at: task ? task.assistance_requested_at : null,
    assistance_reason: task ? task.assistance_reason : null,
    completed_at: task ? task.completed_at : null,
    cancelled_at: row.cancelled_at || null,
    cancellation_reason: row.cancellation_reason || null,
    reopened_at: row.reopened_at || null,
    reopen_reason: row.reopen_reason || null,
    forwarded_to_ecmd_at: row.forwarded_to_ecmd_at || null,
    forwarded_to_ecmd_by: row.forwarded_to_ecmd_by || null,
    verified_at: row.verified_at || null,
    verified_by: row.verified_by || null,
    resolution_code: row.resolution_code || null,
    resolution_notes: row.resolution_notes || null,
    archived_at: row.archived_at || null,
    archive_reason: row.archive_reason || null,
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
  const active = shaped.filter(c => ACTIVE_STATUSES.has(c.status))

  for (const complaint of active) {
    const related = active.filter(other => {
      if (other.id === complaint.id) return false
      if (other.complaint_type !== complaint.complaint_type) return false
      if (Math.abs(new Date(other.created_at) - new Date(complaint.created_at)) > DUPLICATE_WINDOW_MS) return false

      // Prefer GPS proximity when both records have coordinates. Roughly 250 m
      // is enough to flag a likely shared leak/interruption without automatically
      // declaring it a duplicate.
      if (complaint.gps && other.gps) {
        const latKm = (complaint.gps.lat - other.gps.lat) * 111
        const lngKm = (complaint.gps.lng - other.gps.lng) * 111 * Math.cos((complaint.gps.lat * Math.PI) / 180)
        return Math.sqrt(latKm * latKm + lngKm * lngKm) <= 0.25
      }

      const a = String(complaint.zone || complaint.address || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
      const b = String(other.zone || other.address || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
      if (!a || !b) return false
      if (a === b || a.includes(b) || b.includes(a)) return true
      const aw = new Set(a.split(' ').filter(word => word.length > 2))
      const bw = new Set(b.split(' ').filter(word => word.length > 2))
      const overlap = [...aw].filter(word => bw.has(word)).length
      return overlap >= 2
    })

    if (related.length) {
      complaint.similar_count = related.length
      complaint.similar_ids = related.map(item => item.id)
    }
  }

  return shaped
}
