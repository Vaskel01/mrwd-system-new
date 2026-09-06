export function buildCommercialHandoff(note, userId, now) {
  return {
    status: 'forwarded',
    forwarded_to_ecmd_at: now,
    forwarded_to_ecmd_by: userId,
    commercial_handoff_note: String(note || '').trim() || null,
    rejection_reason: null,
    rejected_at: null,
    updated_at: now,
  }
}
