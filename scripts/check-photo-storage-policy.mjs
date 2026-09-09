import { readFile } from 'node:fs/promises'

import { createClient } from '@supabase/supabase-js'

function parseEnvironment(source) {
  return Object.fromEntries(source
    .split(/\r?\n/)
    .map(line => line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/))
    .filter(Boolean)
    .map(match => [match[1], match[2].replace(/^['"]|['"]$/g, '')]))
}

const localEnvironment = parseEnvironment(await readFile(new URL('../.env', import.meta.url), 'utf8'))
const url = localEnvironment.VITE_SUPABASE_URL
const key = localEnvironment.VITE_SUPABASE_ANON_KEY
const password = process.env.MRWD_DEMO_PASSWORD
const ownerEmail = process.env.MRWD_STORAGE_OWNER_EMAIL
const otherEmail = process.env.MRWD_STORAGE_OTHER_EMAIL

if (!url || !key || !password || !ownerEmail || !otherEmail) {
  throw new Error(
    'Set MRWD_DEMO_PASSWORD, MRWD_STORAGE_OWNER_EMAIL, and MRWD_STORAGE_OTHER_EMAIL. '
    + 'The Supabase URL and publishable key are read from .env.',
  )
}

const ownerClient = createClient(url, key, { auth: { persistSession: false } })
const otherClient = createClient(url, key, { auth: { persistSession: false } })
const ownerLogin = await ownerClient.auth.signInWithPassword({ email: ownerEmail, password })
const otherLogin = await otherClient.auth.signInWithPassword({ email: otherEmail, password })
if (ownerLogin.error) throw new Error(`Owner sign-in failed: ${ownerLogin.error.message}`)
if (otherLogin.error) throw new Error(`Second-user sign-in failed: ${otherLogin.error.message}`)

const ownerId = ownerLogin.data.user.id
const objectName = `policy-check-${crypto.randomUUID()}.png`
const path = `${ownerId}/qa/${objectName}`
const image = Uint8Array.from(Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
))
const bucket = ownerClient.storage.from('complaint-photos')

const upload = await bucket.upload(path, image, { contentType: 'image/png', upsert: false })
if (upload.error) throw new Error(`Owner upload failed: ${upload.error.message}`)

let ownerRemoved = false
try {
  const publicUrl = bucket.getPublicUrl(path).data.publicUrl
  const publicResponse = await fetch(publicUrl)
  if (publicResponse.ok) throw new Error('Complaint evidence is still anonymously reachable through a permanent public URL.')

  const ownerSigned = await bucket.createSignedUrl(path, 60)
  if (ownerSigned.error || !ownerSigned.data?.signedUrl) throw new Error(`Owner signed URL failed: ${ownerSigned.error?.message || 'missing signed URL'}`)
  const signedResponse = await fetch(ownerSigned.data.signedUrl)
  if (!signedResponse.ok) throw new Error(`Owner signed URL could not be read (${signedResponse.status}).`)

  const crossUserSigned = await otherClient.storage.from('complaint-photos').createSignedUrl(path, 60)
  if (!crossUserSigned.error) throw new Error('A different signed-in user was able to mint a signed URL for an unlinked owner upload.')

  await otherClient.storage.from('complaint-photos').remove([path])
  const afterCrossUserAttempt = await bucket.list(`${ownerId}/qa`, { search: objectName })
  if (afterCrossUserAttempt.error) throw afterCrossUserAttempt.error
  if (!afterCrossUserAttempt.data.some(item => item.name === objectName)) throw new Error('A different signed-in user was able to delete the owner upload.')

  const badMimePath = `${ownerId}/qa/policy-check-${crypto.randomUUID()}.txt`
  const badMime = await bucket.upload(badMimePath, Uint8Array.from([1, 2, 3]), { contentType: 'text/plain', upsert: false })
  if (!badMime.error) {
    await bucket.remove([badMimePath])
    throw new Error('The bucket accepted a non-image MIME type.')
  }

  const oversizedPath = `${ownerId}/qa/policy-check-${crypto.randomUUID()}.png`
  const oversized = await bucket.upload(oversizedPath, new Uint8Array((6 * 1024 * 1024) + 1), { contentType: 'image/png', upsert: false })
  if (!oversized.error) {
    await bucket.remove([oversizedPath])
    throw new Error('The bucket accepted a file larger than 6 MB.')
  }

  const removal = await bucket.remove([path])
  if (removal.error) throw new Error(`Owner cleanup failed: ${removal.error.message}`)
  ownerRemoved = true
  const afterOwnerCleanup = await bucket.list(`${ownerId}/qa`, { search: objectName })
  if (afterOwnerCleanup.error) throw afterOwnerCleanup.error
  if (afterOwnerCleanup.data.some(item => item.name === objectName)) throw new Error('The owner cleanup call returned without removing the upload.')

  console.log('PASS private bucket; PASS owner signed URL; PASS cross-user signed/read/delete denied; PASS MIME limit; PASS 6 MB limit; PASS cleanup')
} finally {
  if (!ownerRemoved) await bucket.remove([path])
  await ownerClient.auth.signOut()
  await otherClient.auth.signOut()
}
