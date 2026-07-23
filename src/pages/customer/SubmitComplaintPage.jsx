import { useState, useEffect, useRef } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useAuthStore } from '../../store/authStore'
import { useComplaintStore } from '../../store/complaintStore'
import { COMPLAINT_TYPES } from '../../config/staticData'
import { ErrorBanner } from '../../components/ui/Feedback'

const schema = z.object({
  complaint_type: z.string().min(1, 'Select a complaint type'),
  description:    z.string().min(20, 'Please describe the issue in at least 20 characters'),
  address:        z.string().min(10, 'Enter the full address or location'),
})

const STEP_LABELS = ['Type', 'Details', 'Location', 'Review']

const TYPE_ICONS = {
  'Water Interruption': '🚱',
  'Water Leak': '💧',
  'Low Water Pressure': '📉',
  'Dirty / Discolored Water': '⚠️',
  'Billing Concern': '🧾',
  'Meter Problem': '📊',
  'New Connection Request': '🔌',
  'Other': '📝',
}

// ── Interactive pin-on-map using Leaflet (loaded via CDN) ───────────────────
function PinMap({ lat, lng, onPinChange }) {
  const mapRef = useRef(null)
  const leafletMap = useRef(null)
  const markerRef = useRef(null)

  useEffect(() => {
    // Load Leaflet CSS
    if (!document.getElementById('leaflet-css')) {
      const link = document.createElement('link')
      link.id = 'leaflet-css'
      link.rel = 'stylesheet'
      link.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css'
      document.head.appendChild(link)
    }

    // Load Leaflet JS then init map
    const initMap = () => {
      if (leafletMap.current || !mapRef.current) return
      const L = window.L
      const initLat = lat || 11.5869  // Roxas City default
      const initLng = lng || 122.7511

      const map = L.map(mapRef.current, { zoomControl: true, scrollWheelZoom: false }).setView([initLat, initLng], lat ? 16 : 12)
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors', maxZoom: 19,
      }).addTo(map)

      // Custom marker icon
      const icon = L.divIcon({
        html: `<div style="width:28px;height:28px;background:#1b3366;border:3px solid white;border-radius:50% 50% 50% 0;transform:rotate(-45deg);box-shadow:0 2px 6px rgba(0,0,0,.35)"></div>`,
        iconSize: [28, 28], iconAnchor: [14, 28], className: '',
      })

      if (lat && lng) {
        const m = L.marker([lat, lng], { draggable: true, icon }).addTo(map)
        m.on('dragend', () => {
          const { lat: la, lng: lo } = m.getLatLng()
          reverseGeocode(la, lo, onPinChange)
        })
        markerRef.current = m
      }

      map.on('click', (e) => {
        const { lat: la, lng: lo } = e.latlng
        if (markerRef.current) {
          markerRef.current.setLatLng([la, lo])
        } else {
          const m = L.marker([la, lo], { draggable: true, icon }).addTo(map)
          m.on('dragend', () => {
            const { lat: la2, lng: lo2 } = m.getLatLng()
            reverseGeocode(la2, lo2, onPinChange)
          })
          markerRef.current = m
        }
        reverseGeocode(la, lo, onPinChange)
      })

      leafletMap.current = map
    }

    if (window.L) {
      initMap()
    } else {
      const script = document.createElement('script')
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js'
      script.onload = initMap
      document.head.appendChild(script)
    }

    return () => {
      if (leafletMap.current) { leafletMap.current.remove(); leafletMap.current = null; markerRef.current = null }
    }
  }, [])

  return (
    <div>
      <div ref={mapRef} style={{ height: 240, width: '100%' }} className="border border-gray-200" />
      <p className="text-xs text-gray-400 mt-1.5">Tap the map or drag the pin to set the exact location.</p>
    </div>
  )
}

async function reverseGeocode(lat, lng, callback) {
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`)
    const d = await r.json()
    callback({ lat, lng, accuracy: 10, address: d?.display_name || `${lat.toFixed(6)}, ${lng.toFixed(6)}` })
  } catch {
    callback({ lat, lng, accuracy: 10, address: `${lat.toFixed(6)}, ${lng.toFixed(6)}` })
  }
}

export default function SubmitComplaintPage() {
  const user            = useAuthStore(s => s.user)
  const submitComplaint = useComplaintStore(s => s.submitComplaint)

  const [step, setStep] = useState(0)
  const [photo, setPhoto] = useState(null)
  const [photoPreview, setPhotoPreview] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState(null)
  const [submitted, setSubmitted] = useState(null)

  // GPS / location state
  const [locationMode, setLocationMode] = useState(null) // null | 'gps' | 'pin'
  const [gpsCoords, setGpsCoords] = useState(null)       // { lat, lng, accuracy }
  const [gpsLoading, setGpsLoading] = useState(false)
  const [gpsError, setGpsError] = useState(null)

  const { register, handleSubmit, watch, reset, trigger, setValue, formState: { errors } } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { complaint_type: '', description: '', address: '' },
  })

  const watchedType = watch('complaint_type')
  const watchedDesc = watch('description')
  const watchedAddr = watch('address')

  const handlePhotoChange = (e) => {
    const file = e.target.files[0]
    if (!file) return
    setPhoto(file)
    setPhotoPreview(URL.createObjectURL(file))
  }

  const removePhoto = () => { setPhoto(null); setPhotoPreview(null) }

  // ── GPS / Geolocation ────────────────────────────────────────────────────
  const requestGPS = () => {
    if (!navigator.geolocation) {
      setGpsError('Geolocation is not supported by your browser.')
      return
    }
    setGpsLoading(true)
    setGpsError(null)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude: lat, longitude: lng, accuracy } = pos.coords
        setGpsCoords({ lat, lng, accuracy: Math.round(accuracy) })
        setGpsLoading(false)
        setLocationMode('gps')
        // Reverse-geocode using Nominatim (no API key needed)
        fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`)
          .then(r => r.json())
          .then(data => {
            if (data && data.display_name) {
              setValue('address', data.display_name, { shouldValidate: true })
            }
          })
          .catch(() => {
            setValue('address', `${lat.toFixed(6)}, ${lng.toFixed(6)}`, { shouldValidate: true })
          })
      },
      (err) => {
        setGpsLoading(false)
        if (err.code === 1) setGpsError('Location access denied. Please allow location permission and try again.')
        else if (err.code === 2) setGpsError('Location unavailable. Please enter address manually.')
        else setGpsError('Location request timed out. Please enter address manually.')
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    )
  }

  const clearGPS = () => {
    setGpsCoords(null)
    setGpsError(null)
    setLocationMode(null)
    setValue('address', '', { shouldValidate: false })
  }
  // ────────────────────────────────────────────────────────────────────────

  const goNext = async () => {
    let valid = true
    if (step === 0) valid = await trigger('complaint_type')
    if (step === 1) valid = await trigger('description')
    if (step === 2) valid = await trigger('address')
    if (valid) setStep(s => s + 1)
  }

  const onSubmit = async (data) => {
    setSubmitting(true)
    setSubmitError(null)
    try {
      const result = await submitComplaint(
        { ...data, photo, gps: gpsCoords },
        user.id,
        user.full_name
      )
      setSubmitted(result)
      reset()
      setPhoto(null); setPhotoPreview(null); setStep(0)
      setGpsCoords(null); setGpsError(null); setLocationMode(null)
    } catch (err) {
      setSubmitError(err.message)
    } finally { setSubmitting(false) }
  }

  if (submitted) {
    return (
      <div className="max-w-lg mx-auto py-8 px-4">
        <div className="card rounded-xl overflow-hidden">
          <div className="h-2 w-full bg-gold-400" />
          <div className="p-8 text-center">
            <div className="w-14 h-14 rounded-2xl bg-navy-800 flex items-center justify-center mx-auto mb-4">
              <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="square" strokeLinejoin="miter" d="M5 13l4 4L19 7"/>
              </svg>
            </div>
            <h2 className="text-xl font-black text-gray-900 mb-1 font-display tracking-tight">COMPLAINT FILED</h2>
            <p className="text-gray-400 text-sm mb-6">Submitted successfully and queued for staff review</p>

            <div className="text-left rounded-lg border border-gray-100 divide-y divide-gray-100 mb-6 text-sm">
              <div className="flex items-center justify-between px-4 py-3">
                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Ref ID</span>
                <span className="font-mono text-xs text-gray-700">{submitted.id}</span>
              </div>
              <div className="flex items-center justify-between px-4 py-3">
                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Complaint Type</span>
                <span className="font-semibold text-gray-800 text-right">{submitted.complaint_type}</span>
              </div>
              {submitted.gps && (
                <div className="flex items-center justify-between px-4 py-3">
                  <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">GPS</span>
                  <span className="font-mono text-xs text-green-700 bg-green-50 px-2 py-0.5">
                    📍 {submitted.gps.lat.toFixed(5)}, {submitted.gps.lng.toFixed(5)}
                  </span>
                </div>
              )}
            </div>
            <button onClick={() => setSubmitted(null)} className="btn-primary w-full">File Another Report</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full space-y-6">
      {/* Page header */}
      <div className="page-band wave-header rounded-2xl px-6 py-6 relative overflow-hidden">
        <svg className="absolute bottom-0 left-0 right-0 w-full opacity-10" viewBox="0 0 1200 60" preserveAspectRatio="none">
          <path d="M0,30 C200,0 400,60 600,30 C800,0 1000,60 1200,30 L1200,60 L0,60 Z" fill="white"/>
        </svg>
        <p className="relative text-gold-400 text-[11px] font-bold uppercase tracking-[.15em] mb-1.5">Customer Portal</p>
        <h1 className="relative font-display font-black text-white text-2xl sm:text-3xl">File a Report</h1>
        <p className="relative text-navy-300 text-sm mt-1">Provide the issue details so the MRWD team can review and respond.</p>
      </div>

      {/* Step rail */}
      <div className="grid grid-cols-4 gap-1.5 sm:gap-2">
        {STEP_LABELS.map((label, i) => (
          <div key={i} className={`h-10 min-w-0 flex items-center justify-center sm:justify-start gap-1.5 sm:gap-2 px-2 sm:px-3 rounded-lg text-xs font-bold transition-colors border ${
              i === step ? 'bg-navy-900 text-white border-navy-900' :
              i < step  ? 'bg-navy-800 text-white border-gold-500' :
                          'bg-white text-gray-400 border-gray-200'
            }`}>
              <span className={`w-5 h-5 flex items-center justify-center text-xs font-black shrink-0 ${
                i < step ? '' : i === step ? '' : 'opacity-50'
              }`}>
                {i < step ? '✓' : i + 1}
              </span>
              <span className="hidden sm:inline truncate">{label}</span>
          </div>
        ))}
      </div>

      <form onSubmit={handleSubmit(onSubmit)}>

        {/* Step 0 — Type */}
        {step === 0 && (
          <div className="card rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
              <p className="text-xs font-black text-gray-500 uppercase tracking-widest">What is the issue?</p>
            </div>
            <div className="p-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {COMPLAINT_TYPES.map(t => (
                  <label key={t} className={`flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all ${
                    watchedType === t ? 'border-gold-500 bg-gold-50' : 'border-gray-100 hover:border-gray-300 bg-white'
                  }`}>
                    <input aria-label="Complaint type" type="radio" value={t} {...register('complaint_type')} className="sr-only" />
                    <span className="text-xl shrink-0">{TYPE_ICONS[t] || '📝'}</span>
                    <span className={`text-sm font-semibold ${watchedType === t ? 'text-navy-800' : 'text-gray-700'}`}>{t}</span>
                  </label>
                ))}
              </div>
              {errors.complaint_type && <p className="mt-3 text-xs text-red-600 font-semibold">{errors.complaint_type.message}</p>}
              <button type="button" onClick={goNext} className="btn-primary w-full mt-5" style={{ borderRadius: 8 }}>Continue →</button>
            </div>
          </div>
        )}

        {/* Step 1 — Description */}
        {step === 1 && (
          <div className="card rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
              <p className="text-xs font-black text-gray-500 uppercase tracking-widest">Describe the Problem</p>
              <span className="text-xs font-mono text-gray-400">{watchedType}</span>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <div className="flex justify-between mb-1.5">
                  <label className="text-sm font-bold text-gray-700">Details <span className="text-red-500">*</span></label>
                  <span className="text-xs text-gray-400 font-mono">{watchedDesc?.length || 0} / 20 min</span>
                </div>
                <textarea aria-label="Description" rows={5} placeholder="When did it start? How bad is it? Who is affected?"
                  {...register('description')}
                  className={`input-field resize-none ${errors.description ? 'input-error' : ''}`} />
                {errors.description && <p className="mt-1 text-xs text-red-600">{errors.description.message}</p>}
              </div>

              <div>
                <p className="text-sm font-bold text-gray-700 mb-1.5">
                  Photo
                  <span className="ml-2 text-xs font-normal text-gray-500 bg-gray-100 px-2 py-0.5">Optional</span>
                </p>
                {photoPreview ? (
                  <div className="flex items-center gap-3 p-3 border border-gray-200 bg-gray-50">
                    <img src={photoPreview} alt="Preview" className="w-14 h-14 object-cover border border-gray-300"/>
                    <div>
                      <p className="text-xs font-bold text-gray-700">Photo attached ✓</p>
                      <button type="button" onClick={removePhoto} className="text-xs text-red-500 hover:text-red-700 mt-0.5">Remove</button>
                    </div>
                  </div>
                ) : (
                  <label className="flex items-center gap-3 p-4 border-2 border-dashed border-gray-200 cursor-pointer hover:border-gold-400 transition-colors bg-gray-50">
                    <svg className="w-5 h-5 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                    <span className="text-sm text-gray-500">Attach a photo (optional)</span>
                    <input name="complaint_photo" aria-label="Complaint photo" type="file" accept="image/*" className="hidden" onChange={handlePhotoChange}/>
                  </label>
                )}
              </div>
            </div>
            <div className="flex gap-0 border-t border-gray-200">
              <button type="button" onClick={() => setStep(0)} className="flex-1 py-3 text-sm font-bold text-gray-600 bg-gray-50 hover:bg-gray-100 border-r border-gray-200 transition-colors">← Back</button>
              <button type="button" onClick={goNext} className="flex-1 py-3 text-sm font-bold text-white bg-navy-800 hover:bg-navy-900 transition-colors">Continue →</button>
            </div>
          </div>
        )}

        {/* Step 2 — Location (GPS or pin on map) */}
        {step === 2 && (
          <div className="card rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
              <p className="text-xs font-black text-gray-500 uppercase tracking-widest">Where is this happening?</p>
            </div>
            <div className="p-5 space-y-4">

              {/* Mode chooser — shown until a mode is active */}
              {!locationMode && !gpsCoords && (
                <div className="grid grid-cols-2 gap-3">
                  {/* GPS button */}
                  <button
                    type="button"
                    onClick={requestGPS}
                    disabled={gpsLoading}
                    className="flex flex-col items-center gap-2 p-4 rounded-xl border-2 border-gold-500 text-navy-800 font-bold text-sm hover:bg-gold-50 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {gpsLoading ? (
                      <div className="w-6 h-6 border-2 border-gold-500 border-t-transparent animate-spin rounded-full" />
                    ) : (
                      <svg className="w-6 h-6 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/>
                      </svg>
                    )}
                    <span className="text-xs text-center leading-tight">{gpsLoading ? 'Getting location…' : 'Use My Location'}</span>
                  </button>

                  {/* Pin on map button */}
                  <button
                    type="button"
                    onClick={() => setLocationMode('pin')}
                    className="flex flex-col items-center gap-2 p-4 rounded-xl border-2 border-gray-300 text-gray-600 font-bold text-sm hover:border-gold-400 hover:text-navy-800 hover:bg-gold-50 transition-colors"
                  >
                    <svg className="w-6 h-6 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"/>
                    </svg>
                    <span className="text-xs text-center leading-tight">Pin on Map</span>
                  </button>
                </div>
              )}

              {gpsError && (
                <p className="text-xs text-red-600 font-semibold flex items-start gap-1">
                  <span>⚠️</span> {gpsError}
                </p>
              )}

              {/* GPS success panel */}
              {locationMode === 'gps' && gpsCoords && (
                <div className="border border-green-200 bg-green-50 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-green-600 text-lg">📍</span>
                      <div>
                        <p className="text-xs font-black text-green-800 uppercase tracking-wider">GPS Location Captured</p>
                        <p className="text-xs text-green-700 font-mono mt-0.5">
                          {gpsCoords.lat.toFixed(6)}, {gpsCoords.lng.toFixed(6)}
                        </p>
                        <p className="text-xs text-green-600 mt-0.5">±{gpsCoords.accuracy}m accuracy</p>
                      </div>
                    </div>
                    <button type="button" onClick={clearGPS} className="text-xs text-red-500 hover:text-red-700 font-bold shrink-0">Change</button>
                  </div>
                </div>
              )}

              {/* Pin on map mode */}
              {locationMode === 'pin' && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-black text-gray-500 uppercase tracking-wider">Tap or drag the pin</p>
                    <button type="button" onClick={clearGPS} className="text-xs text-gray-400 hover:text-red-500 font-bold">✕ Cancel</button>
                  </div>
                  <PinMap
                    lat={gpsCoords?.lat}
                    lng={gpsCoords?.lng}
                    onPinChange={({ lat, lng, accuracy, address }) => {
                      setGpsCoords({ lat, lng, accuracy })
                      setValue('address', address, { shouldValidate: true })
                    }}
                  />
                  {gpsCoords && (
                    <div className="mt-2 flex items-center gap-1.5 text-xs text-gray-500">
                      <span className="font-mono bg-gray-100 px-2 py-0.5">
                        📍 {gpsCoords.lat.toFixed(5)}, {gpsCoords.lng.toFixed(5)}
                      </span>
                      <span className="text-gray-400">pinned</span>
                    </div>
                  )}
                </div>
              )}

              {/* Divider + manual entry (always visible after mode shown) */}
              {(locationMode || gpsError) && (
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-px bg-gray-200" />
                  <span className="text-xs text-gray-400 font-bold uppercase tracking-wider">address</span>
                  <div className="flex-1 h-px bg-gray-200" />
                </div>
              )}

              {/* Address text field */}
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1.5">
                  Full Address <span className="text-red-500">*</span>
                  {gpsCoords && <span className="ml-2 text-xs font-normal text-gold-600 bg-gold-50 px-2 py-0.5">Auto-filled ✓</span>}
                </label>
                <input aria-label="Address" type="text" placeholder="e.g. 123 Rizal St., Brgy. Baybay, Roxas City, Capiz"
                  {...register('address')}
                  className={`input-field ${errors.address ? 'input-error' : ''}`} />
                {errors.address && <p className="mt-1 text-xs text-red-600">{errors.address.message}</p>}
              </div>
            </div>
            <div className="flex gap-0 border-t border-gray-200">
              <button type="button" onClick={() => setStep(1)} className="flex-1 py-3 text-sm font-bold text-gray-600 bg-gray-50 hover:bg-gray-100 border-r border-gray-200 transition-colors">← Back</button>
              <button type="button" onClick={goNext} className="flex-1 py-3 text-sm font-bold text-white bg-navy-800 hover:bg-navy-900 transition-colors">Review →</button>
            </div>
          </div>
        )}

        {/* Step 3 — Review */}
        {step === 3 && (
          <div className="card rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
              <p className="text-xs font-black text-gray-500 uppercase tracking-widest">Review Before Submitting</p>
            </div>
            <div className="divide-y divide-gray-100 text-sm">
              <div className="flex gap-4 px-5 py-3">
                <span className="text-xs font-black text-gray-400 uppercase tracking-wider w-20 shrink-0 pt-0.5">Type</span>
                <span className="font-bold text-gray-900">{TYPE_ICONS[watchedType]} {watchedType}</span>
              </div>
              <div className="flex gap-4 px-5 py-3">
                <span className="text-xs font-black text-gray-400 uppercase tracking-wider w-20 shrink-0 pt-0.5">Details</span>
                <span className="text-gray-700 leading-relaxed">{watchedDesc}</span>
              </div>
              <div className="flex gap-4 px-5 py-3">
                <span className="text-xs font-black text-gray-400 uppercase tracking-wider w-20 shrink-0 pt-0.5">Location</span>
                <div className="flex-1">
                  <span className="text-gray-700">{watchedAddr}</span>
                  {gpsCoords && (
                    <div className="mt-1.5 flex items-center gap-1.5">
                      <span className="text-xs bg-green-100 text-green-800 font-mono px-2 py-0.5 font-bold">
                        📍 GPS: {gpsCoords.lat.toFixed(5)}, {gpsCoords.lng.toFixed(5)}
                      </span>
                      <span className="text-xs text-gray-400">±{gpsCoords.accuracy}m</span>
                    </div>
                  )}
                </div>
              </div>
              <div className="flex gap-4 px-5 py-3">
                <span className="text-xs font-black text-gray-400 uppercase tracking-wider w-20 shrink-0 pt-0.5">Photo</span>
                <span className="text-gray-700">{photo ? '✓ Attached' : 'None'}</span>
              </div>
            </div>

            {submitError && <div className="px-5"><ErrorBanner message={submitError} /></div>}

            <div className="flex gap-0 border-t border-gray-200">
              <button type="button" onClick={() => setStep(2)} className="flex-1 py-3 text-sm font-bold text-gray-600 bg-gray-50 hover:bg-gray-100 border-r border-gray-200 transition-colors">← Back</button>
              <button type="submit" disabled={submitting} className="flex-1 py-3 text-sm font-bold text-white bg-navy-800 hover:bg-navy-900 disabled:opacity-60 transition-colors flex items-center justify-center gap-2">
                {submitting ? <><div className="w-4 h-4 border-2 border-white border-t-transparent animate-spin"/>Submitting...</> : 'Submit Report →'}
              </button>
            </div>
          </div>
        )}
      </form>
    </div>
  )
}
