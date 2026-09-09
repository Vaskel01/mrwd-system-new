import assert from 'node:assert/strict'
import test from 'node:test'

import {
  normalizeComplaintPhotoPath,
  requireExistingOwnedComplaintPhotoPath,
  requireOwnedComplaintPhotoPath,
} from '../src/lib/photoStorage.js'

test('legacy public and signed URLs normalize to private complaint-photo object paths', () => {
  assert.equal(
    normalizeComplaintPhotoPath('https://example.supabase.co/storage/v1/object/public/complaint-photos/user-1/a.jpg'),
    'user-1/a.jpg',
  )
  assert.equal(
    normalizeComplaintPhotoPath('https://example.supabase.co/storage/v1/object/sign/complaint-photos/user-1/completion/a.png?token=secret'),
    'user-1/completion/a.png',
  )
  assert.equal(normalizeComplaintPhotoPath('user-1/a.webp'), 'user-1/a.webp')
})

test('server accepts only owner-scoped paths and enforces the completion folder', () => {
  assert.equal(requireOwnedComplaintPhotoPath('user-1/a.jpg', 'user-1'), 'user-1/a.jpg')
  assert.equal(
    requireOwnedComplaintPhotoPath('user-1/completion/a.jpg', 'user-1', { folder: 'completion' }),
    'user-1/completion/a.jpg',
  )
  assert.throws(() => requireOwnedComplaintPhotoPath('user-2/a.jpg', 'user-1'), /signed-in user/i)
  assert.throws(() => requireOwnedComplaintPhotoPath('user-1/a.jpg', 'user-1', { folder: 'completion' }), /completion evidence folder/i)
  assert.throws(() => requireOwnedComplaintPhotoPath('https://evil.example/photo.jpg', 'user-1'), /invalid/i)
})
test('server requires the owner-scoped photo object to exist in secure storage', async () => {
  const existingClient = {
    storage: {
      from: () => ({
        list: async (directory, options) => {
          assert.equal(directory, 'user-1/completion')
          assert.equal(options.search, 'proof.jpg')
          return { data: [{ name: 'proof.jpg' }], error: null }
        },
      }),
    },
  }
  assert.equal(
    await requireExistingOwnedComplaintPhotoPath(
      existingClient,
      'user-1/completion/proof.jpg',
      'user-1',
      { folder: 'completion' },
    ),
    'user-1/completion/proof.jpg',
  )

  const missingClient = {
    storage: { from: () => ({ list: async () => ({ data: [], error: null }) }) },
  }
  await assert.rejects(
    requireExistingOwnedComplaintPhotoPath(
      missingClient,
      'user-1/completion/fabricated.jpg',
      'user-1',
      { folder: 'completion' },
    ),
    /not found in secure storage/i,
  )
})