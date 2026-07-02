import { useEffect, useRef } from 'react'

/**
 * InlineMap — renders a small Leaflet map with a pin at the given lat/lng.
 * Loads Leaflet via CDN on first use. Read-only (no dragging).
 */
export default function InlineMap({ lat, lng, accuracy, height = 200 }) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)

  useEffect(() => {
    if (!lat || !lng) return

    const init = () => {
      if (mapRef.current || !containerRef.current) return
      const L = window.L

      const map = L.map(containerRef.current, {
        zoomControl: true,
        scrollWheelZoom: false,
        dragging: true,
        doubleClickZoom: false,
        attributionControl: true,
      }).setView([lat, lng], 17)

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OSM</a>',
        maxZoom: 19,
      }).addTo(map)

      // Pin icon
      const icon = L.divIcon({
        html: `<div style="
          width:22px;height:22px;
          background:#1d4ed8;
          border:3px solid white;
          border-radius:50% 50% 50% 0;
          transform:rotate(-45deg);
          box-shadow:0 2px 6px rgba(0,0,0,.4);
        "></div>`,
        iconSize: [22, 22],
        iconAnchor: [11, 22],
        className: '',
      })

      L.marker([lat, lng], { icon }).addTo(map)

      // Accuracy circle
      if (accuracy && accuracy > 5) {
        L.circle([lat, lng], {
          radius: accuracy,
          color: '#1d4ed8',
          fillColor: '#1d4ed8',
          fillOpacity: 0.08,
          weight: 1,
        }).addTo(map)
      }

      mapRef.current = map
    }

    // Load Leaflet CSS once
    if (!document.getElementById('leaflet-css')) {
      const link = document.createElement('link')
      link.id = 'leaflet-css'
      link.rel = 'stylesheet'
      link.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css'
      document.head.appendChild(link)
    }

    if (window.L) {
      init()
    } else if (!document.getElementById('leaflet-js')) {
      const script = document.createElement('script')
      script.id = 'leaflet-js'
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js'
      script.onload = init
      document.head.appendChild(script)
    } else {
      // Script tag exists but may still be loading
      const check = setInterval(() => {
        if (window.L) { clearInterval(check); init() }
      }, 50)
    }

    return () => {
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null }
    }
  }, [lat, lng])

  if (!lat || !lng) return null

  return (
    <div className="mt-2 border border-gray-200 overflow-hidden">
      <div ref={containerRef} style={{ height, width: '100%' }} />
      <div className="flex items-center justify-between px-3 py-1.5 bg-gray-50 border-t border-gray-100">
        <span className="font-mono text-xs text-gray-500">
          📍 {lat.toFixed(5)}, {lng.toFixed(5)}
          {accuracy ? <span className="text-gray-400 ml-1">±{accuracy}m</span> : null}
        </span>
        <a
          href={`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-brand-600 hover:underline font-semibold"
        >
          Open in OSM ↗
        </a>
      </div>
    </div>
  )
}
