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
//   (joined maintenance_tasks)  → assigned_to

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

  const [{ data: categories }, { data: profiles }, { data: tasks }] = await Promise.all([
    categoryIds.length
      ? supabase.from('complaint_categories').select('id, name').in('id', categoryIds)
      : { data: [] },
    residentIds.length
      ? supabase.from('profiles').select('id, full_name').in('id', residentIds)
      : { data: [] },
    complaintIds.length
      ? supabase.from('maintenance_tasks').select('*').in('complaint_id', complaintIds).order('created_at', { ascending: false })
      : { data: [] },
  ])

  const categoryMap = Object.fromEntries((categories || []).map(c => [c.id, c.name]))
  const profileMap  = Object.fromEntries((profiles || []).map(p => [p.id, p.full_name]))

  // Most recent task per complaint (tasks already ordered newest-first)
  const taskMap = {}
  for (const t of tasks || []) {
    if (!taskMap[t.complaint_id]) taskMap[t.complaint_id] = t
  }

  return rows.map(row => shapeOne(row, categoryMap, profileMap, taskMap))
}

export async function fetchShapedComplaintById(supabase, id) {
  const results = await fetchShapedComplaints(supabase, { filter: q => q.eq('id', id) })
  return results[0] || null
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
    zone: row.zone,
    gps: (row.lat != null && row.lng != null) ? { lat: row.lat, lng: row.lng, accuracy: null } : null,
    status: row.status,
    priority: row.priority,
    priority_score: row.priority_score,
    rule_score: row.rule_score,
    sentiment_score: row.sentiment_score,
    assigned_to: task ? task.assigned_staff_id : null,
    task_status: task ? task.status : null,
    created_at: row.submitted_at,
    updated_at: row.updated_at,
  }
}
