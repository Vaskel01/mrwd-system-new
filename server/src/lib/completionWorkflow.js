export const COMPLETABLE_TASK_STATUSES = new Set(['assigned', 'en_route', 'in_progress', 'blocked'])

export function buildDirectCompletion({ body = {}, task = {}, now = new Date().toISOString() } = {}) {
  if (!COMPLETABLE_TASK_STATUSES.has(task.status)) {
    throw new Error('Only active field work can be completed.')
  }

  const completionNotes = String(body.completion_notes || '').trim()
  const completionPhotoUrl = String(body.completion_photo_url || '').trim()
  const materialsUsed = String(body.materials_used || task.materials_used || '').trim() || null

  if (completionNotes.length < 5) {
    throw new Error('Resolution notes of at least 5 characters are required.')
  }
  if (!completionPhotoUrl) {
    throw new Error('A completion proof photo is required.')
  }

  return {
    completionNotes,
    taskUpdate: {
      status: 'completed',
      completed_at: now,
      completion_notes: completionNotes,
      completion_photo_url: completionPhotoUrl,
      materials_used: materialsUsed,
      unable_reason: null,
      reassignment_requested_at: null,
      reassignment_reason: null,
      assistance_requested_at: null,
      assistance_reason: null,
    },
    complaintUpdate: {
      status: 'resolved',
      verified_at: null,
      verified_by: null,
      resolution_code: 'resolved',
      resolution_notes: completionNotes,
      updated_at: now,
    },
  }
}
