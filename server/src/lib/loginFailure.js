export function loginFailure(error) {
  if (error?.status === 429) return { status: 429, reason: 'rate_limited', message: 'Too many sign-in attempts. Please wait before trying again.' }
  if (!error || !error.status || error.status >= 500 || error.name === 'AuthRetryableFetchError') {
    return { status: 503, reason: 'auth_unavailable', message: 'Sign-in service is temporarily unavailable. Please try again shortly.' }
  }
  return { status: 401, reason: 'invalid_credentials', message: 'Incorrect email or password.' }
}
