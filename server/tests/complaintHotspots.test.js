import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildComplaintHotspots,
  haversineDistanceMeters,
  HOTSPOT_MIN_COMPLAINTS,
  HOTSPOT_RADIUS_METERS,
} from '../../src/lib/complaintHotspots.js'
import { STATUS_LABELS } from '../../src/config/terminology.js'

const base = { lat: 11.5853, lng: 122.7511 }
const metersToLatitude = meters => meters / 111320

function complaint(id, northMeters, overrides = {}) {
  return {
    id,
    reference_number: `TEST-${id}`,
    complaint_type: 'Water Leak',
    address: 'Demo Street, Roxas City, Capiz',
    zone: 'Demo Zone',
    gps: { lat: base.lat + metersToLatitude(northMeters), lng: base.lng },
    status: 'forwarded',
    priority: 'medium',
    created_at: `2026-09-11T0${id}:00:00+08:00`,
    ...overrides,
  }
}

test('hotspot defaults are 300 meters and at least 3 complaints', () => {
  assert.equal(HOTSPOT_RADIUS_METERS, 300)
  assert.equal(HOTSPOT_MIN_COMPLAINTS, 3)
})

test('two nearby active complaints do not create a hotspot', () => {
  const hotspots = buildComplaintHotspots([complaint(1, 0), complaint(2, 100)])
  assert.equal(hotspots.length, 0)
})

test('three active complaints within 300 meters create one hotspot', () => {
  const hotspots = buildComplaintHotspots([complaint(1, 0), complaint(2, 80), complaint(3, 160)])
  assert.equal(hotspots.length, 1)
  assert.equal(hotspots[0].total, 3)
  assert.equal(hotspots[0].area, 'Demo Zone')
  assert.equal(hotspots[0].mostCommonCategory, 'Water Leak')
})

test('a complaint outside the radius is excluded from the hotspot', () => {
  const hotspots = buildComplaintHotspots([
    complaint(1, 0), complaint(2, 70), complaint(3, 140), complaint(4, 700),
  ])
  assert.equal(hotspots.length, 1)
  assert.deepEqual(hotspots[0].complaints.map(item => item.id).sort(), [1, 2, 3])
})

test('complaints without valid coordinates are ignored', () => {
  const hotspots = buildComplaintHotspots([
    complaint(1, 0), complaint(2, 80), complaint(3, 160),
    complaint(4, 40, { gps: null }),
    complaint(5, 40, { gps: { lat: 200, lng: 122 } }),
  ])
  assert.equal(hotspots.length, 1)
  assert.equal(hotspots[0].total, 3)
})

test('resolved, cancelled, and rejected complaints are excluded', () => {
  const hotspots = buildComplaintHotspots([
    complaint(1, 0), complaint(2, 50),
    complaint(3, 100, { status: 'resolved' }),
    complaint(4, 120, { status: 'cancelled' }),
    complaint(5, 140, { status: 'rejected' }),
  ])
  assert.equal(hotspots.length, 0)
})

test('overlapping candidate groups never display the same complaint twice', () => {
  const input = [
    complaint(1, 0, { priority: 'high' }),
    complaint(2, 120),
    complaint(3, 240),
    complaint(4, 360),
    complaint(5, 480),
    complaint(6, 600),
  ]
  const hotspots = buildComplaintHotspots(input)
  const ids = hotspots.flatMap(hotspot => hotspot.complaints.map(item => item.id))
  assert.equal(new Set(ids).size, ids.length)
})


test('every displayed hotspot member remains inside the final center radius', () => {
  const hotspots = buildComplaintHotspots([
    complaint(1, -280), complaint(2, 250), complaint(3, 270), complaint(4, 290),
  ])
  assert.equal(hotspots.length, 1)
  const hotspot = hotspots[0]
  for (const item of hotspot.complaints) {
    assert.ok(haversineDistanceMeters(hotspot.center, item.gps) <= HOTSPOT_RADIUS_METERS)
  }
})

test('distance helper uses geographic distance rather than exact coordinate equality', () => {
  const near = { lat: base.lat + metersToLatitude(250), lng: base.lng }
  const far = { lat: base.lat + metersToLatitude(500), lng: base.lng }
  assert.ok(haversineDistanceMeters(base, near) < 300)
  assert.ok(haversineDistanceMeters(base, far) > 300)
})

test('in_progress is presented to users as Field Work', () => {
  assert.equal(STATUS_LABELS.in_progress, 'Field Work')
  assert.equal(STATUS_LABELS.en_route, 'En Route')
  assert.equal(STATUS_LABELS.blocked, 'Blocked')
})
