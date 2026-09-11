import { useEffect, useRef } from 'react'
import { MAP_MARKER_FALLBACK, STATUS_VISUAL_TOKENS } from '../../config/uiTokens'
import { statusLabel } from '../../config/terminology'

function validPoint(item) {
  const lat = Number(item?.gps?.lat)
  const lng = Number(item?.gps?.lng)
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180
}

function validHotspot(hotspot) {
  const lat = Number(hotspot?.center?.lat)
  const lng = Number(hotspot?.center?.lng)
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180
}

function hotspotPopupNode(hotspot, onHotspotOpen) {
  const wrapper = document.createElement('div')
  wrapper.style.minWidth = '220px'

  const title = document.createElement('strong')
  title.textContent = 'Complaint Hotspot'
  wrapper.appendChild(title)

  const lines = [
    hotspot.area,
    `${hotspot.total} active complaints`,
    `Most common issue: ${hotspot.mostCommonCategory}`,
    `High: ${hotspot.priorityBreakdown?.high || 0} · Medium: ${hotspot.priorityBreakdown?.medium || 0} · Low: ${hotspot.priorityBreakdown?.low || 0}`,
    `Radius: ${hotspot.radiusMeters} meters`,
  ]

  lines.forEach((line, index) => {
    const element = document.createElement(index === 0 ? 'div' : 'small')
    element.textContent = line
    if (index === 0) element.style.marginTop = '4px'
    if (index > 0) element.style.display = 'block'
    wrapper.appendChild(element)
  })

  if (onHotspotOpen) {
    const button = document.createElement('button')
    button.type = 'button'
    button.textContent = 'View Hotspot Details'
    button.style.marginTop = '10px'
    button.style.padding = '7px 10px'
    button.style.borderRadius = '7px'
    button.style.border = '0'
    button.style.background = '#1b3366'
    button.style.color = '#fff'
    button.style.fontSize = '12px'
    button.style.fontWeight = '700'
    button.style.cursor = 'pointer'
    button.addEventListener('click', () => onHotspotOpen(hotspot))
    wrapper.appendChild(button)
  }

  return wrapper
}

export default function ComplaintOperationsMap({ complaints = [], hotspots = [], height = 420, onOpen, onHotspotOpen, focusHotspotId = null }) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const complaintLayerRef = useRef(null)
  const hotspotLayerRef = useRef(null)
  const hotspotMarkerRefs = useRef(new Map())

  useEffect(() => {
    const points = complaints.filter(validPoint)
    const hotspotPoints = hotspots.filter(validHotspot)

    if (points.length === 0 && hotspotPoints.length === 0) {
      if (complaintLayerRef.current) {
        complaintLayerRef.current.remove()
        complaintLayerRef.current = null
      }
      if (hotspotLayerRef.current) {
        hotspotLayerRef.current.remove()
        hotspotLayerRef.current = null
      }
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
      }
      hotspotMarkerRefs.current.clear()
      return undefined
    }

    if (!containerRef.current) return undefined

    const init = () => {
      if (!window.L || !containerRef.current) return

      if (mapRef.current && mapRef.current.getContainer() !== containerRef.current) {
        mapRef.current.remove()
        mapRef.current = null
        complaintLayerRef.current = null
        hotspotLayerRef.current = null
        hotspotMarkerRefs.current.clear()
      }

      const firstLocation = points[0]?.gps || hotspotPoints[0]?.center
      if (!mapRef.current) {
        mapRef.current = window.L.map(containerRef.current, { scrollWheelZoom: false }).setView([firstLocation.lat, firstLocation.lng], 13)
        window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap', maxZoom: 19 }).addTo(mapRef.current)
      }

      if (complaintLayerRef.current) complaintLayerRef.current.remove()
      if (hotspotLayerRef.current) hotspotLayerRef.current.remove()
      hotspotMarkerRefs.current.clear()

      const complaintGroup = window.L.featureGroup()
      points.forEach(item => {
        const color = STATUS_VISUAL_TOKENS[item.status] || MAP_MARKER_FALLBACK
        const marker = window.L.circleMarker([item.gps.lat, item.gps.lng], {
          radius: item.priority === 'high' ? 9 : 7,
          color: '#fff',
          weight: 2,
          fillColor: color,
          fillOpacity: 0.95,
        })
        marker.bindPopup(`
          <div style="min-width:190px">
            <strong>${item.reference_number || 'Complaint'}</strong><br/>
            <span>${item.complaint_type || 'Complaint'}</span><br/>
            <small>${item.address || ''}</small><br/>
            <small>Status: ${statusLabel(item.status)}</small>
          </div>
        `)
        if (onOpen) marker.on('click', () => onOpen(item))
        marker.addTo(complaintGroup)
      })
      complaintGroup.addTo(mapRef.current)
      complaintLayerRef.current = complaintGroup

      const hotspotGroup = window.L.featureGroup()
      hotspotPoints.forEach(hotspot => {
        const center = [hotspot.center.lat, hotspot.center.lng]
        const circle = window.L.circle(center, {
          radius: hotspot.radiusMeters || 300,
          color: '#b45309',
          weight: 2,
          fillColor: '#f59e0b',
          fillOpacity: 0.12,
        })
        circle.addTo(hotspotGroup)

        const icon = window.L.divIcon({
          className: '',
          html: `<div style="display:flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:999px;border:3px solid white;background:#b45309;color:white;font-weight:900;font-size:12px;box-shadow:0 2px 8px rgba(15,23,42,.28)">${hotspot.total}</div>`,
          iconSize: [32, 32],
          iconAnchor: [16, 16],
        })
        const marker = window.L.marker(center, { icon })
        marker.bindPopup(hotspotPopupNode(hotspot, onHotspotOpen), { maxWidth: 300 })
        circle.on('click', () => marker.openPopup())
        marker.addTo(hotspotGroup)
        hotspotMarkerRefs.current.set(hotspot.id, marker)
      })
      hotspotGroup.addTo(mapRef.current)
      hotspotLayerRef.current = hotspotGroup

      mapRef.current.invalidateSize(false)

      const focused = hotspotPoints.find(item => item.id === focusHotspotId)
      if (focused) {
        mapRef.current.setView([focused.center.lat, focused.center.lng], 15, { animate: true })
        window.setTimeout(() => hotspotMarkerRefs.current.get(focused.id)?.openPopup(), 150)
      } else {
        const bounds = window.L.latLngBounds([])
        if (points.length) bounds.extend(complaintGroup.getBounds())
        if (hotspotPoints.length) bounds.extend(hotspotGroup.getBounds())
        if (bounds.isValid()) {
          if (points.length + hotspotPoints.length === 1) mapRef.current.setView(firstLocation, 16)
          else mapRef.current.fitBounds(bounds.pad(0.18))
        }
      }
    }

    if (!document.getElementById('leaflet-css')) {
      const link = document.createElement('link')
      link.id = 'leaflet-css'
      link.rel = 'stylesheet'
      link.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css'
      document.head.appendChild(link)
    }

    if (window.L) init()
    else if (!document.getElementById('leaflet-js')) {
      const script = document.createElement('script')
      script.id = 'leaflet-js'
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js'
      script.onload = init
      document.head.appendChild(script)
    } else {
      const timer = window.setInterval(() => {
        if (window.L) {
          window.clearInterval(timer)
          init()
        }
      }, 50)
      return () => window.clearInterval(timer)
    }

    return undefined
  }, [complaints, focusHotspotId, hotspots, onHotspotOpen, onOpen])

  useEffect(() => () => {
    if (mapRef.current) {
      mapRef.current.remove()
      mapRef.current = null
    }
  }, [])

  const hasContent = complaints.some(validPoint) || hotspots.some(validHotspot)
  if (!hasContent) {
    return <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-8 text-center text-sm text-gray-500">No mapped complaints match the current filters.</div>
  }

  return <div ref={containerRef} className="overflow-hidden rounded-xl border border-gray-200" style={{ height }} />
}
