import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createComplaintPhotoPath,
  persistUploadedPhoto,
  validateComplaintPhoto,
} from '../../src/lib/photoPersistence.js'

test('photo paths are unique, owner-scoped, and preserve a safe extension', () => {
  const ids = ['first-id', 'second-id']
  const uniqueId = () => ids.shift()

  assert.equal(createComplaintPhotoPath({
    userId: 'user-1', fileName: 'repair.JPEG', folder: '/completion/', uniqueId,
  }), 'user-1/completion/first-id.jpeg')
  assert.equal(createComplaintPhotoPath({
    userId: 'user-1', fileName: 'repair.JPEG', folder: '/completion/', uniqueId,
  }), 'user-1/completion/second-id.jpeg')
})

test('photo validation rejects non-images and images larger than 6 MB', () => {
  assert.throws(
    () => validateComplaintPhoto({ type: 'text/plain', size: 1 }),
    /JPEG, PNG, or WebP/i,
  )
  assert.throws(
    () => validateComplaintPhoto({ type: 'image/jpeg', size: (6 * 1024 * 1024) + 1 }),
    /larger than 6 MB/i,
  )
})

test('successful persistence does not reconcile or remove the photo', async () => {
  let reconciled = false
  let removed = false
  const record = { id: 'complaint-1' }

  const result = await persistUploadedPhoto({
    asset: { path: 'user/photo.jpg' },
    persist: async () => record,
    reconcile: async () => { reconciled = true },
    remove: async () => { removed = true },
  })

  assert.equal(result, record)
  assert.equal(reconciled, false)
  assert.equal(removed, false)
})

test('lost save response recovers the committed record and preserves its photo', async () => {
  let removed = false
  const record = { id: 'complaint-1' }

  const result = await persistUploadedPhoto({
    asset: { path: 'user/photo.jpg' },
    persist: async () => { throw new Error('connection lost') },
    reconcile: async () => record,
    remove: async () => { removed = true },
  })

  assert.equal(result, record)
  assert.equal(removed, false)
})

test('definitively unsaved records remove their orphaned photo', async () => {
  const originalError = new Error('invalid complaint')
  let removedPath = null

  await assert.rejects(
    persistUploadedPhoto({
      asset: { path: 'user/photo.jpg' },
      persist: async () => { throw originalError },
      reconcile: async () => null,
      remove: async path => { removedPath = path },
    }),
    error => error === originalError,
  )
  assert.equal(removedPath, 'user/photo.jpg')
})

test('failed reconciliation preserves the photo and tells the user to refresh', async () => {
  let removed = false

  await assert.rejects(
    persistUploadedPhoto({
      asset: { path: 'user/photo.jpg' },
      persist: async () => { throw new Error('connection lost') },
      reconcile: async () => { throw new Error('still offline') },
      remove: async () => { removed = true },
    }),
    /photo was preserved.*refresh/i,
  )
  assert.equal(removed, false)
})

test('cleanup failure is reported instead of hiding a remaining orphan', async () => {
  await assert.rejects(
    persistUploadedPhoto({
      asset: { path: 'user/photo.jpg' },
      persist: async () => { throw new Error('invalid complaint') },
      reconcile: async () => null,
      remove: async () => { throw new Error('storage unavailable') },
    }),
    /could not be cleaned up/i,
  )
})
