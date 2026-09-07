export const MAX_COMPLAINT_PHOTO_BYTES = 6 * 1024 * 1024

export function validateComplaintPhoto(file) {
  if (!file) return

  if (!file.type?.startsWith('image/')) {
    throw new Error('Please attach an image file for the complaint photo.')
  }

  if (file.size > MAX_COMPLAINT_PHOTO_BYTES) {
    throw new Error('The photo is larger than 6 MB. Choose a smaller image and try again.')
  }
}

export function createComplaintPhotoPath({ userId, fileName, folder = '', uniqueId }) {
  if (!userId) throw new Error('You must be signed in before uploading a photo.')

  const extension = fileName?.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase() || 'jpg'
  const safeExtension = /^[a-z0-9]{1,10}$/.test(extension) ? extension : 'jpg'
  const nestedFolder = folder.replace(/^\/+|\/+$/g, '').replace(/[^a-z0-9/_-]/gi, '')
  const prefix = nestedFolder ? `${nestedFolder}/` : ''
  const objectId = uniqueId ? uniqueId() : globalThis.crypto.randomUUID()

  return `${userId}/${prefix}${objectId}.${safeExtension}`
}

// A save response can be lost after the server has already committed the record.
// Reconcile before deleting the upload so a valid complaint never loses its photo.
export async function persistUploadedPhoto({ asset, persist, reconcile, remove }) {
  try {
    return await persist(asset.publicUrl)
  } catch (saveError) {
    let recoveredRecord

    try {
      recoveredRecord = await reconcile(asset.publicUrl)
    } catch {
      throw new Error(
        'The connection was interrupted and the saved record could not be confirmed. '
        + 'The photo was preserved. Refresh the page to check before trying again.',
        { cause: saveError },
      )
    }

    if (recoveredRecord) return recoveredRecord

    try {
      await remove(asset.path)
    } catch {
      throw new Error(
        'The record was not saved, and its uploaded photo could not be cleaned up. '
        + 'Please try again or contact an administrator.',
        { cause: saveError },
      )
    }

    throw saveError
  }
}
