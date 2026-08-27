import { useEffect, useId, useRef, useState } from 'react'

function HelpIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.8 9a2.35 2.35 0 0 1 4.45 1.05c0 1.65-2.25 1.8-2.25 3.45" />
      <path strokeLinecap="round" d="M12 17h.01" />
    </svg>
  )
}

export default function PageHelpTooltip({ help, floating = false, className = '' }) {
  const [open, setOpen] = useState(false)
  const [pinned, setPinned] = useState(false)
  const rootRef = useRef(null)
  const tooltipId = useId()

  useEffect(() => {
    if (!open) return undefined

    const onPointerDown = event => {
      if (rootRef.current && !rootRef.current.contains(event.target)) {
        setOpen(false)
        setPinned(false)
      }
    }
    const onKeyDown = event => {
      if (event.key === 'Escape') {
        setOpen(false)
        setPinned(false)
      }
    }

    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  if (!help) return null

  const showTemporarily = () => setOpen(true)
  const hideTemporarily = () => {
    if (!pinned) setOpen(false)
  }
  const togglePinned = () => {
    if (open && pinned) {
      setOpen(false)
      setPinned(false)
      return
    }
    setOpen(true)
    setPinned(true)
  }

  return (
    <div
      ref={rootRef}
      className={`relative ${className}`}
      onMouseEnter={showTemporarily}
      onMouseLeave={hideTemporarily}
    >
      <button
        type="button"
        onClick={togglePinned}
        onFocus={showTemporarily}
        onBlur={event => {
          if (!rootRef.current?.contains(event.relatedTarget)) hideTemporarily()
        }}
        className={floating
          ? 'flex min-h-11 items-center gap-2 rounded-full border border-gray-200 bg-white px-3.5 py-2 text-sm font-bold text-navy-800 shadow-lg transition hover:border-navy-300 hover:bg-navy-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2'
          : 'flex h-9 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 text-xs font-bold text-gray-600 shadow-sm transition hover:border-navy-200 hover:text-navy-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2'
        }
        aria-label={`Page help for ${help.title}`}
        aria-expanded={open}
        aria-describedby={open ? tooltipId : undefined}
      >
        <span className="h-4 w-4 shrink-0"><HelpIcon /></span>
        <span className={floating ? 'hidden sm:inline' : 'hidden xl:inline'}>Page help</span>
      </button>

      {open && (
        <div
          id={tooltipId}
          role="tooltip"
          className="absolute right-0 top-full z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-gray-200 bg-white p-4 text-left shadow-xl"
        >
          <div className="mb-3 flex items-start gap-3">
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-navy-50 text-navy-700">
              <span className="h-4 w-4"><HelpIcon /></span>
            </span>
            <div className="min-w-0">
              <p className="font-display text-base font-black text-navy-950">{help.title}</p>
              <p className="mt-1 text-sm leading-6 text-gray-600">{help.summary}</p>
            </div>
          </div>

          {help.tips?.length > 0 && (
            <div className="border-t border-gray-100 pt-3">
              <p className="text-xs font-black uppercase tracking-[0.12em] text-gray-500">Helpful tips</p>
              <ul className="mt-2 space-y-2">
                {help.tips.map(tip => (
                  <li key={tip} className="flex gap-2 text-sm leading-5 text-gray-700">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-gold-500" aria-hidden="true" />
                    <span>{tip}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="mt-3 border-t border-gray-100 pt-3 text-xs leading-5 text-gray-500">
            Hover or focus for quick help. Click or tap the help button to keep this panel open.
          </p>
        </div>
      )}
    </div>
  )
}
