// ─────────────────────────────────────────────
// STATIC CONFIG — not mock/fake data, just fixed
// lists the UI needs (dropdown options, category
// colors, etc). Actual records now come from the
// backend API (server/) — see src/store/*.js
// ─────────────────────────────────────────────

export const COMPLAINT_TYPES = [
  'No Water',
  'Water Leak',
  'Low Water Pressure',
  'Dirty / Discolored Water',
  'Billing Concern',
  'Meter Problem',
  'New Connection Request',
  'Other',
]

export const ANNOUNCEMENT_CATEGORIES = [
  { value: 'general',      label: 'General',       color: 'bg-gray-100 text-gray-700' },
  { value: 'interruption', label: 'Interruption',  color: 'bg-red-100 text-red-700' },
  { value: 'billing',      label: 'Billing',       color: 'bg-gray-100 text-gray-700' },
  { value: 'maintenance',  label: 'Maintenance',   color: 'bg-gray-100 text-gray-700' },
  { value: 'advisory',     label: 'Advisory',      color: 'bg-gray-100 text-gray-700' },
]
