// ─────────────────────────────────────────────
// STATIC CONFIG — not mock/fake data, just fixed
// lists the UI needs (dropdown options, category
// colors, etc). Actual records now come from the
// backend API (server/) — see src/store/*.js
// ─────────────────────────────────────────────

export const COMPLAINT_TYPES = [
  'Water Interruption',
  'Water Leak',
  'Low Water Pressure',
  'Dirty / Discolored Water',
  'Billing Concern',
  'Meter Problem',
  'New Connection Request',
  'Other',
]

export const ANNOUNCEMENT_CATEGORIES = [
  { value: 'general',      label: 'General',       color: 'bg-blue-100 text-blue-700' },
  { value: 'interruption', label: 'Interruption',  color: 'bg-red-100 text-red-700' },
  { value: 'billing',      label: 'Billing',       color: 'bg-yellow-100 text-yellow-800' },
  { value: 'maintenance',  label: 'Maintenance',   color: 'bg-purple-100 text-purple-700' },
  { value: 'advisory',     label: 'Advisory',      color: 'bg-green-100 text-green-700' },
]
