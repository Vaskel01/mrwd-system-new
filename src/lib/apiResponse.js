// A proxy can return an HTML error page with HTTP 200. Never treat that as a
// successful save or encourage an automatic retry of a possibly applied write.
export async function readApiResponse(response) {
  const body = await response.text()
  let data
  try { data = JSON.parse(body) } catch {
    throw new Error(`The server returned an unexpected response (${response.status}). Refresh to check whether your change was saved before trying again.`)
  }
  if (!response.ok) {
    const error = new Error(data?.error || `Request failed (${response.status})`)
    error.status = response.status
    error.code = data?.code || null
    error.fieldErrors = data?.field_errors && typeof data.field_errors === 'object'
      ? data.field_errors
      : {}
    throw error
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('The server returned an invalid response. Refresh to check whether your change was saved before trying again.')
  }
  return data
}
