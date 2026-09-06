// A proxy can return an HTML error page with HTTP 200. Never treat that as a
// successful save or encourage an automatic retry of a possibly applied write.
export async function readApiResponse(response) {
  const body = await response.text()
  let data
  try { data = JSON.parse(body) } catch {
    throw new Error(`The server returned an unexpected response (${response.status}). Refresh to check whether your change was saved before trying again.`)
  }
  if (!response.ok) throw new Error(data?.error || `Request failed (${response.status})`)
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('The server returned an invalid response. Refresh to check whether your change was saved before trying again.')
  }
  return data
}
