export const HOTSPOT_ACTIVE_STATUSES = Object.freeze(['forwarded', 'assigned', 'en_route', 'in_progress', 'blocked'])
export const HOTSPOT_RADIUS_METERS = 300
export const HOTSPOT_MIN_COMPLAINTS = 3

const ACTIVE_STATUS_SET = new Set(HOTSPOT_ACTIVE_STATUSES)
const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 }

function asFiniteNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

export function complaintCoordinates(complaint) {
  const lat = asFiniteNumber(complaint?.gps?.lat)
  const lng = asFiniteNumber(complaint?.gps?.lng)
  if (lat == null || lng == null || lat < -90 || lat > 90 || lng < -180 || lng > 180) return null
  return { lat, lng }
}

export function haversineDistanceMeters(a, b) {
  const first = complaintCoordinates({ gps: a })
  const second = complaintCoordinates({ gps: b })
  if (!first || !second) return Number.POSITIVE_INFINITY

  const earthRadiusMeters = 6371000
  const toRadians = value => value * Math.PI / 180
  const lat1 = toRadians(first.lat)
  const lat2 = toRadians(second.lat)
  const deltaLat = toRadians(second.lat - first.lat)
  const deltaLng = toRadians(second.lng - first.lng)
  const haversine = Math.sin(deltaLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2
  return earthRadiusMeters * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
}

function compactArea(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  const parts = raw.split(',').map(part => part.trim()).filter(Boolean)
  if (parts.length >= 2) return parts[parts.length - 2]
  return parts[0]
}

function mostCommonLabel(items, getValue) {
  const counts = new Map()
  for (const item of items) {
    const display = String(getValue(item) || '').trim()
    if (!display) continue
    const key = display.toLowerCase()
    const current = counts.get(key) || { display, count: 0 }
    current.count += 1
    counts.set(key, current)
  }
  return [...counts.values()].sort((a, b) => b.count - a.count || a.display.localeCompare(b.display))[0]?.display || ''
}

function hotspotArea(items) {
  const zone = mostCommonLabel(items, item => item.zone)
  if (zone) return zone
  const addressArea = mostCommonLabel(items, item => compactArea(item.address))
  if (addressArea) return addressArea
  return 'Mapped service area'
}

function hotspotCenter(items) {
  const coordinates = items.map(complaintCoordinates).filter(Boolean)
  return {
    lat: coordinates.reduce((sum, point) => sum + point.lat, 0) / coordinates.length,
    lng: coordinates.reduce((sum, point) => sum + point.lng, 0) / coordinates.length,
  }
}

function stableHotspotId(items) {
  const input = items.map(item => String(item.id)).sort().join('|')
  let hash = 5381
  for (let index = 0; index < input.length; index += 1) hash = ((hash << 5) + hash) ^ input.charCodeAt(index)
  return `hotspot-${(hash >>> 0).toString(36)}`
}

function summarizeCluster(items, radiusMeters) {
  const center = hotspotCenter(items)
  const priorityBreakdown = { high: 0, medium: 0, low: 0 }
  const statusBreakdown = {}
  for (const item of items) {
    if (Object.hasOwn(priorityBreakdown, item.priority)) priorityBreakdown[item.priority] += 1
    statusBreakdown[item.status] = (statusBreakdown[item.status] || 0) + 1
  }

  const complaints = [...items].sort((a, b) => {
    const priorityDifference = (PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9)
    if (priorityDifference) return priorityDifference
    return new Date(b.created_at || b.submitted_at || 0) - new Date(a.created_at || a.submitted_at || 0)
  })

  return {
    id: stableHotspotId(items),
    area: hotspotArea(items),
    center,
    radiusMeters,
    total: items.length,
    mostCommonCategory: mostCommonLabel(items, item => item.complaint_type) || 'Mixed complaints',
    priorityBreakdown,
    statusBreakdown,
    complaints,
  }
}

export function buildComplaintHotspots(complaints = [], options = {}) {
  const radiusMeters = Number(options.radiusMeters) > 0 ? Number(options.radiusMeters) : HOTSPOT_RADIUS_METERS
  const minComplaints = Number(options.minComplaints) >= 2 ? Math.floor(Number(options.minComplaints)) : HOTSPOT_MIN_COMPLAINTS
  let remaining = complaints.filter(item => ACTIVE_STATUS_SET.has(item?.status) && complaintCoordinates(item))
  const hotspots = []

  while (remaining.length >= minComplaints) {
    let best = null

    for (const anchor of remaining) {
      const anchorCoordinates = complaintCoordinates(anchor)
      let members = remaining.filter(item => haversineDistanceMeters(anchorCoordinates, complaintCoordinates(item)) <= radiusMeters)
      if (members.length < minComplaints) continue

      // Re-center the candidate on the average coordinate and remove any edge
      // point that would sit outside the displayed hotspot circle. Repeating
      // this until stable keeps the visual 300 m circle honest: every member
      // shown for a hotspot is actually within 300 m of its final center.
      let changed = true
      while (changed && members.length >= minComplaints) {
        const center = hotspotCenter(members)
        const filtered = members.filter(item => haversineDistanceMeters(center, complaintCoordinates(item)) <= radiusMeters)
        changed = filtered.length !== members.length
        members = filtered
      }
      if (members.length < minComplaints) continue

      const center = hotspotCenter(members)
      const highPriority = members.filter(item => item.priority === 'high').length
      const distanceSum = members.reduce((sum, item) => sum + haversineDistanceMeters(center, complaintCoordinates(item)), 0)
      const candidate = { members, highPriority, distanceSum }

      if (!best
        || candidate.members.length > best.members.length
        || (candidate.members.length === best.members.length && candidate.highPriority > best.highPriority)
        || (candidate.members.length === best.members.length && candidate.highPriority === best.highPriority && candidate.distanceSum < best.distanceSum)) {
        best = candidate
      }
    }

    if (!best) break
    hotspots.push(summarizeCluster(best.members, radiusMeters))
    const assignedIds = new Set(best.members.map(item => item.id))
    remaining = remaining.filter(item => !assignedIds.has(item.id))
  }

  return hotspots.sort((a, b) => b.total - a.total || b.priorityBreakdown.high - a.priorityBreakdown.high || a.area.localeCompare(b.area))
}
