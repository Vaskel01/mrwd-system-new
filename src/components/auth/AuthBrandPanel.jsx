import { useRef } from 'react'
import { Link } from 'react-router-dom'
import AppIcon from '../ui/AppIcon'

const FEATURES = [
  { icon: 'document', text: 'Report a water service problem' },
  { icon: 'refresh', text: 'Track each complaint from review to resolution' },
  { icon: 'announcement', text: 'Read current service advisories' },
  { icon: 'droplet', text: 'View your billing information' },
]

function WaterArtwork() {
  return (
    <div className="login-wave-art" aria-hidden="true">
      <div className="login-wave-parallax">
        <svg className="login-wave-layer login-wave-back" viewBox="0 0 1200 320" preserveAspectRatio="none">
          <path d="M0 118C150 66 298 65 449 116s296 51 446 3 236-45 305-13v214H0Z" fill="currentColor" />
        </svg>
        <svg className="login-wave-layer login-wave-middle" viewBox="0 0 1200 320" preserveAspectRatio="none">
          <path d="M0 175c169-49 320-43 470 7s292 45 430-4 221-39 300-6v148H0Z" fill="currentColor" />
        </svg>
        <svg className="login-wave-layer login-wave-front" viewBox="0 0 1200 320" preserveAspectRatio="none">
          <path d="M0 236c160-37 302-31 449 7s294 35 437-2 232-29 314-3v82H0Z" fill="currentColor" />
          <path className="login-wave-highlight" d="M0 236c160-37 302-31 449 7s294 35 437-2 232-29 314-3" fill="none" />
        </svg>
      </div>
    </div>
  )
}

export default function AuthBrandPanel({ title, accent, description, footer }) {
  const panelRef = useRef(null)

  const handlePointerMove = event => {
    if (event.pointerType && event.pointerType !== 'mouse') return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const panel = panelRef.current
    if (!panel) return
    const bounds = panel.getBoundingClientRect()
    const horizontal = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width))
    const vertical = Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height))

    panel.style.setProperty('--login-wave-x', `${(horizontal - 0.5) * 10}px`)
    panel.style.setProperty('--login-wave-y', `${(vertical - 0.5) * 4}px`)
  }

  const resetPointer = () => {
    panelRef.current?.style.setProperty('--login-wave-x', '0px')
    panelRef.current?.style.setProperty('--login-wave-y', '0px')
  }

  return (
    <aside
      ref={panelRef}
      onPointerMove={handlePointerMove}
      onPointerLeave={resetPointer}
      className="auth-info-panel page-band relative hidden w-[52%] flex-col justify-between overflow-hidden p-12 lg:flex"
      aria-label="About the MRWD complaint system"
    >
      <WaterArtwork />

      <Link to="/" className="group relative flex w-fit items-center gap-3 rounded-lg">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/20 bg-white/15 text-white backdrop-blur-sm" aria-hidden="true">
          <AppIcon name="droplet" className="h-5 w-5" />
        </span>
        <span>
          <span className="block font-display text-sm font-bold leading-none text-white">Metro Roxas Water District</span>
          <span className="mt-1 block text-xs font-semibold text-navy-200">Complaint Management System · Roxas City, Capiz</span>
        </span>
      </Link>

      <div className="relative max-w-xl">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-1.5 backdrop-blur-sm">
          <span className="h-2 w-2 rounded-full bg-gold-300" aria-hidden="true" />
          <span className="text-xs font-bold text-gold-300">MRWD online services</span>
        </div>
        <h1 className="max-w-lg whitespace-pre-line font-display text-5xl font-extrabold leading-tight text-white">
          {title}{' '}<span className="text-gold-300">{accent}</span>
        </h1>
        <p className="mt-5 max-w-md text-lg leading-relaxed text-navy-100">{description}</p>

        <div className="mt-8 space-y-3" aria-label="Available online services">
          {FEATURES.map(feature => (
            <div key={feature.text} className="auth-feature-row flex items-center gap-3 text-navy-100">
              <span className="auth-feature-icon flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/10" aria-hidden="true">
                <AppIcon name={feature.icon} className="h-4 w-4" />
              </span>
              <span className="text-sm font-medium">{feature.text}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="relative rounded-xl border border-white/15 bg-white/10 p-5 backdrop-blur-sm">
        <p className="text-sm leading-relaxed text-navy-100">{footer}</p>
      </div>
    </aside>
  )
}
