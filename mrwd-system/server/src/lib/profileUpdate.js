const FIELD_LIMITS = {
  account_number: 64,
  phone: 32,
  service_address: 500,
  barangay: 120,
}

function normalizeOptionalText(value, field) {
  const normalized = value == null ? '' : String(value).trim()
  if (normalized.length > FIELD_LIMITS[field]) {
    const label = field.replaceAll('_', ' ')
    throw new Error(`${label.charAt(0).toUpperCase()}${label.slice(1)} is too long.`)
  }
  return normalized || null
}

export function normalizeCustomerProfileInput(payload = {}) {
  return {
    account_number: normalizeOptionalText(payload.account_number, 'account_number'),
    phone: normalizeOptionalText(payload.phone, 'phone'),
    service_address: normalizeOptionalText(payload.service_address, 'service_address'),
    barangay: normalizeOptionalText(payload.barangay, 'barangay'),
  }
}

export function customerProfileMatches(profile, expected) {
  return ['account_number', 'phone', 'service_address', 'barangay']
    .every(field => (profile?.[field] || null) === expected[field])
}
