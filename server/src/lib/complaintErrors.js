import {
  COMPLAINT_DESCRIPTION_MAX_LENGTH,
  COMPLAINT_DESCRIPTION_MIN_LENGTH,
} from '../../../src/config/complaintValidation.js'

function body(error, code, fieldErrors) {
  return {
    error,
    code,
    ...(fieldErrors ? { field_errors: fieldErrors } : {}),
  }
}

export function complaintWriteErrorResponse(error, operation = 'submit') {
  const code = String(error?.code || '')

  if (code === '23514') {
    const descriptionMessage = `Please provide a complaint description between ${COMPLAINT_DESCRIPTION_MIN_LENGTH} and ${COMPLAINT_DESCRIPTION_MAX_LENGTH.toLocaleString()} characters.`
    return {
      status: 400,
      body: body('Please review the highlighted complaint details and try again.', 'VALIDATION_ERROR', {
        description: descriptionMessage,
      }),
    }
  }

  if (code === '23503') {
    return {
      status: 400,
      body: body('The selected service account is no longer available. Choose another account or submit this as a general complaint.', 'SERVICE_ACCOUNT_UNAVAILABLE', {
        service_account_id: 'Choose an available service account or leave this selection blank.',
      }),
    }
  }

  if (code === '42501') {
    return {
      status: 403,
      body: body("Your account does not have permission to save this complaint. Refresh the page and sign in again if the problem continues.", 'COMPLAINT_PERMISSION_DENIED'),
    }
  }

  if (code.startsWith('08') || code.startsWith('PGRST00')) {
    return {
      status: 503,
      body: body("The complaint service is temporarily unavailable. Your information is still saved in this browser; wait a moment and try again.", 'COMPLAINT_SERVICE_UNAVAILABLE'),
    }
  }

  const action = operation === 'update' ? 'save your complaint changes' : 'submit your complaint'
  return {
    status: 500,
    body: body(`We couldn't ${action} right now. Your information is still saved in this browser. Please try again, and contact MRWD if the problem continues.`, 'COMPLAINT_SAVE_FAILED'),
  }
}

export function logComplaintWriteError(operation, error) {
  console.error(`[complaint.${operation}] database write failed`, {
    code: error?.code || 'unknown',
    message: error?.message || 'Unknown database error',
  })
}
