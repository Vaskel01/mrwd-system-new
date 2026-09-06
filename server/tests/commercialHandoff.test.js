import test from 'node:test'
import assert from 'node:assert/strict'
import { buildCommercialHandoff } from '../src/lib/commercialHandoff.js'

test('single-complaint handoff persists the note with routing metadata', () => {
  const now = '2026-09-07T00:00:00.000Z'
  assert.deepEqual(buildCommercialHandoff('  Inspect connection first.  ', 'commercial-id', now), {
    status: 'forwarded', forwarded_to_ecmd_at: now,
    forwarded_to_ecmd_by: 'commercial-id', commercial_handoff_note: 'Inspect connection first.',
    rejection_reason: null, rejected_at: null, updated_at: now,
  })
})

test('omitted or blank handoff notes are stored as null', () => {
  for (const note of [undefined, null, '', '   ']) {
    assert.equal(buildCommercialHandoff(note, 'commercial-id', 'now').commercial_handoff_note, null)
  }
})
