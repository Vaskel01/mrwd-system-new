import { useEffect, useRef } from 'react'
import AppIcon from './AppIcon'
import { MAP_PIN_COLOR } from '../../config/uiTokens'

export default function InlineMap({ lat, lng, accuracy, height = 200 }) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)

  useEffect(() => {
    if (!lat || !lng) return undefined

    const init = () => {
      if (mapRef.current || !containerRef.current) return
      const leaflet = window.L
      const map = leaflet.map(containerRef.current, {
        zoomControl: true,
        scrollWheelZoom: false,
        dragging: true,
        doubleClickZoom: false,
        attributionControl: true,
      }).setView([lat, lng], 17)

      leaflet.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap',
        maxZoom: 19,
      }).addTo(map)

      const icon = leaflet.divIcon({
        html: `<div style="width:22px;height:22px;background:${MAP_PIN_COLOR};border:3px solid white;border-radius:50% 50% 50% 0;transform:rotate(-45deg);box-shadow:0 2px 6px rgba(0,0,0,.4)"></div>`,
        iconSize: [22, 22],
        iconAnchor: [11, 22],
        className: '',
      })
      leaflet.marker([lat, lng], { icon }).addTo(map)
      if (accuracy && accuracy > 5) {
        leaflet.circle([lat, lng], {
          radius: accuracy,
          color: MAP_PIN_COLOR,
          fillColor: MAP_PIN_COLOR,
          fillOpacity: 0.08,
          weight: 1,
        }).addTo(map)
      }
      mapRef.current = map
    }

    if (!document.getElementById('leaflet-css')) {
      const link = document.createElement('link')
      link.id = 'leaflet-css'
      link.rel = 'stylesheet'
      link.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css'
      document.head.appendChild(link)
    }

    let check
    if (window.L) {
      init()
    } else if (!document.getElementById('leaflet-js')) {
      const script = document.createElement('script')
      script.id = 'leaflet-js'
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js'
      script.onload = init
      document.head.appendChild(script)
    } else {
      check = window.setInterval(() => {
        if (window.L) {
          window.clearInterval(check)
          init()
        }
      }, 50)
    }

    return () => {
      if (check) window.clearInterval(check)
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
      }
    }
  }, [lat, lng, accuracy])

  if (!lat || !lng) return null

  return (
    <div className="leaflet-print-map mt-2 border border-gray-200 overflow-hidden">
      <div ref={containerRef} className="screen-map" style={{ height, width: '100%' }} />
      <div className="print-map-summary hidden p-3 text-sm text-gray-700">
        <p className="font-bold">Map location</p>
        <p className="font-mono mt-1">{lat.toFixed(5)}, {lng.toFixed(5)}{accuracy ? ` ±${accuracy}m` : ''}</p>
        <p className="text-xs mt-1">OpenStreetMap location is available in the digital complaint record.</p>
      </div>
      <div className="flex items-center justify-between px-3 py-1.5 bg-gray-50 border-t border-gray-100">
        <span className="font-mono text-xs text-gray-500 inline-flex items-center gap-1">
          <AppIcon name="location" className="w-3.5 h-3.5" />
          {lat.toFixed(5)}, {lng.toFixed(5)}
          {accuracy ? <span className="text-gray-500 ml-1">±{accuracy}m</span> : null}
        </span>
        <a href={`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}`} target="_blank" rel="noopener noreferrer" className="text-xs text-brand-600 hover:underline font-semibold">
          Open in OSM ↗
        </a>
      </div>
    </div>
  )
}
