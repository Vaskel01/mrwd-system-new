export const COMPLAINT_DESCRIPTION_MIN_LENGTH = 20
export const COMPLAINT_DESCRIPTION_MAX_LENGTH = 1200
export const COMPLAINT_ADDRESS_MIN_LENGTH = 10

export const COMPLAINT_VALIDATION_MESSAGES = Object.freeze({
  complaint_type: 'Select a complaint type.',
  description_required: 'Describe the issue before continuing.',
  description_too_short: `Please provide at least ${COMPLAINT_DESCRIPTION_MIN_LENGTH} characters so MRWD can understand the issue.`,
  description_too_long: `Keep the description to ${COMPLAINT_DESCRIPTION_MAX_LENGTH.toLocaleString()} characters or fewer.`,
  address: `Enter the full address or location using at least ${COMPLAINT_ADDRESS_MIN_LENGTH} characters.`,
})

export function validateComplaintInput(input = {}) {
  const values = {
    complaint_type: String(input.complaint_type || '').trim(),
    description: String(input.description || '').trim(),
    address: String(input.address || '').trim(),
  }
  const fieldErrors = {}

  if (!values.complaint_type) fieldErrors.complaint_type = COMPLAINT_VALIDATION_MESSAGES.complaint_type
  if (!values.description) fieldErrors.description = COMPLAINT_VALIDATION_MESSAGES.description_required
  else if (values.description.length < COMPLAINT_DESCRIPTION_MIN_LENGTH) fieldErrors.description = COMPLAINT_VALIDATION_MESSAGES.description_too_short
  else if (values.description.length > COMPLAINT_DESCRIPTION_MAX_LENGTH) fieldErrors.description = COMPLAINT_VALIDATION_MESSAGES.description_too_long
  if (values.address.length < COMPLAINT_ADDRESS_MIN_LENGTH) fieldErrors.address = COMPLAINT_VALIDATION_MESSAGES.address

  return { values, fieldErrors, valid: Object.keys(fieldErrors).length === 0 }
}
