import { useEffect, useRef } from 'react'

const STATUS_COLOR = {
  pending: '#f59e0b',
  forwarded: '#2563eb',
  assigned: '#7c3aed',
  in_progress: '#0f766e',
  en_route: '#0f766e',
  blocked: '#ea580c',
  awaiting_verification: '#9333ea',
  resolved: '#16a34a',
}

export default function ComplaintOperationsMap({ complaints = [], height = 420, onOpen }) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const layerRef = useRef(null)

  useEffect(() => {
    const points = complaints.filter(item => item?.gps?.lat != null && item?.gps?.lng != null)
    if (!containerRef.current || points.length === 0) return undefined

    const init = () => {
      if (!window.L || !containerRef.current) return
      if (!mapRef.current) {
        mapRef.current = window.L.map(containerRef.current, { scrollWheelZoom: false }).setView([points[0].gps.lat, points[0].gps.lng], 13)
        window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap', maxZoom: 19 }).addTo(mapRef.current)
      }
      if (layerRef.current) layerRef.current.remove()
      const group = window.L.featureGroup()
      points.forEach(item => {
        const color = STATUS_COLOR[item.status] || '#334155'
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
            <small>Status: ${String(item.status || '').replaceAll('_',' ')}</small>
          </div>
        `)
        if (onOpen) marker.on('click', () => onOpen(item))
        marker.addTo(group)
      })
      group.addTo(mapRef.current)
      layerRef.current = group
      if (points.length === 1) mapRef.current.setView([points[0].gps.lat, points[0].gps.lng], 16)
      else mapRef.current.fitBounds(group.getBounds().pad(0.18))
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
  }, [complaints, onOpen])

  useEffect(() => () => {
    if (mapRef.current) {
      mapRef.current.remove()
      mapRef.current = null
    }
  }, [])

  const points = complaints.filter(item => item?.gps?.lat != null && item?.gps?.lng != null)
  if (!points.length) {
    return <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-8 text-center text-sm text-gray-500">No mapped complaints match the current filters.</div>
  }

  return <div ref={containerRef} className="overflow-hidden rounded-xl border border-gray-200" style={{ height }} />
}
