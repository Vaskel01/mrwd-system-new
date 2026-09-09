const BUCKET = 'complaint-photos'
export const COMPLAINT_PHOTO_SIGNED_URL_TTL_SECONDS = 300

function decodeSafe(value) {
  try { return decodeURIComponent(value) } catch { return value }
}

export function normalizeComplaintPhotoPath(value) {
  const raw = String(value || '').trim()
  if (!raw) return null

  if (!/^https?:\/\//i.test(raw)) {
    const clean = raw.replace(/^\/+/, '').replace(/^complaint-photos\//, '')
    return clean && !clean.includes('..') ? clean : null
  }

  try {
    const url = new URL(raw)
    const marker = `/storage/v1/object/`
    const markerIndex = url.pathname.indexOf(marker)
    if (markerIndex < 0) return null
    let suffix = url.pathname.slice(markerIndex + marker.length)
    suffix = suffix.replace(/^(?:public|sign|authenticated)\//, '')
    if (!suffix.startsWith(`${BUCKET}/`)) return null
    const clean = decodeSafe(suffix.slice(BUCKET.length + 1)).replace(/^\/+/, '')
    return clean && !clean.includes('..') ? clean : null
  } catch {
    return null
  }
}

export function requireOwnedComplaintPhotoPath(value, userId, { folder = null } = {}) {
  const path = normalizeComplaintPhotoPath(value)
  if (!path) throw new Error('Invalid complaint photo storage path.')
  const ownerPrefix = `${userId}/`
  if (!userId || !path.startsWith(ownerPrefix)) {
    throw new Error('The complaint photo must be uploaded by the signed-in user.')
  }
  if (folder && !path.startsWith(`${userId}/${folder.replace(/^\/+|\/+$/g, '')}/`)) {
    throw new Error(`The photo must be uploaded to the ${folder} evidence folder.`)
  }
  return path
}

export async function requireExistingOwnedComplaintPhotoPath(supabase, value, userId, options = {}) {
  const path = requireOwnedComplaintPhotoPath(value, userId, options)
  const separatorIndex = path.lastIndexOf('/')
  const directory = path.slice(0, separatorIndex)
  const fileName = path.slice(separatorIndex + 1)
  const { data, error } = await supabase.storage.from(BUCKET).list(directory, {
    limit: 100,
    search: fileName,
  })

  if (error) {
    throw new Error(`The complaint photo could not be verified: ${error.message}`)
  }
  if (!(data || []).some(item => item?.name === fileName)) {
    throw new Error('The complaint photo was not found in secure storage. Upload it again before continuing.')
  }
  return path
}

export async function createComplaintPhotoSignedUrlMap(supabase, values, expiresIn = COMPLAINT_PHOTO_SIGNED_URL_TTL_SECONDS) {
  const paths = [...new Set((values || []).map(normalizeComplaintPhotoPath).filter(Boolean))]
  if (!paths.length) return new Map()

  const bucket = supabase.storage.from(BUCKET)
  const signed = new Map()
  const batch = await bucket.createSignedUrls(paths, expiresIn)
  if (!batch.error) {
    for (const item of batch.data || []) {
      if (item?.path && item?.signedUrl) signed.set(item.path, item.signedUrl)
    }
  }

  // If one missing object or authorization check caused a batch failure, preserve
  // the rest of the complaint response and sign authorized objects individually.
  for (const path of paths) {
    if (signed.has(path)) continue
    try {
      const { data, error } = await bucket.createSignedUrl(path, expiresIn)
      if (!error && data?.signedUrl) signed.set(path, data.signedUrl)
    } catch {
      // Missing/inaccessible evidence is represented by a null public-facing URL.
    }
  }
  return signed
}

export async function attachComplaintPhotoSignedUrls(supabase, complaints) {
  const paths = []
  for (const complaint of complaints || []) {
    paths.push(...(complaint.photo_storage_paths || []))
    if (complaint.completion_photo_storage_path) paths.push(complaint.completion_photo_storage_path)
  }
  const signed = await createComplaintPhotoSignedUrlMap(supabase, paths)
  for (const complaint of complaints || []) {
    complaint.photo_urls = (complaint.photo_storage_paths || []).map(path => signed.get(path)).filter(Boolean)
    complaint.photo_url = complaint.photo_urls[0] || null
    complaint.completion_photo_url = complaint.completion_photo_storage_path
      ? signed.get(complaint.completion_photo_storage_path) || null
      : null
  }
  return complaints
}
