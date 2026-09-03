import { useEffect, useId, useRef } from 'react'

const FOCUSABLE = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

export default function Dialog({ open, title, description, subtitle, onClose, children, maxWidth = 'max-w-lg', closeDisabled = false }) {
  const supportingText = description || subtitle
  const titleId = useId()
  const descriptionId = useId()
  const panelRef = useRef(null)
  const onCloseRef = useRef(onClose)
  const closeDisabledRef = useRef(closeDisabled)

  // Inline callbacks and loading state may change while a user types. Keep the
  // latest values available without restarting the focus trap on every render.
  useEffect(() => {
    onCloseRef.current = onClose
    closeDisabledRef.current = closeDisabled
  }, [onClose, closeDisabled])

  useEffect(() => {
    if (!open) return undefined
    const previousActive = document.activeElement
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const focusFirst = () => {
      const panel = panelRef.current
      if (!panel) return
      const autofocus = panel.querySelector('[data-dialog-initial-focus], [autofocus]')
      const firstField = panel.querySelector('input:not([disabled]), textarea:not([disabled]), select:not([disabled])')
      ;(autofocus || firstField || panel).focus({ preventScroll: true })
    }
    const timer = window.setTimeout(focusFirst, 20)

    const onKeyDown = event => {
      if (event.key === 'Escape' && !closeDisabledRef.current) {
        event.preventDefault()
        onCloseRef.current?.()
        return
      }
      if (event.key !== 'Tab') return
      const panel = panelRef.current
      if (!panel) return
      const focusable = [...panel.querySelectorAll(FOCUSABLE)].filter(el => !el.hasAttribute('disabled'))
      if (!focusable.length) {
        event.preventDefault()
        panel.focus()
        return
      }
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
      if (previousActive instanceof HTMLElement) previousActive.focus()
    }
  }, [open])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-navy-950/60 backdrop-blur-sm" onMouseDown={closeDisabled ? undefined : onClose} aria-hidden="true" />
      <section
        ref={panelRef}
        tabIndex={-1}
        className={`dialog-surface relative max-h-[92vh] w-full ${maxWidth} overflow-y-auto bg-md-surface-container shadow-md-3`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={supportingText ? descriptionId : undefined}
      >
        <header className="dialog-header page-band wave-header wave-header--dialog px-5 py-5 pr-14 sm:px-6">
          <h2 id={titleId} className="font-display text-xl font-medium text-white">{title}</h2>
          {supportingText ? <p id={descriptionId} className="mt-1 text-sm leading-5 text-navy-200">{supportingText}</p> : null}
          <button
            type="button"
            onClick={onClose}
            disabled={closeDisabled}
            className="absolute right-4 top-4 flex h-11 w-11 items-center justify-center rounded-full border border-white/25 text-xl text-white hover:bg-white/10 focus-visible:outline-white disabled:opacity-50"
            aria-label="Close dialog"
          >
            ×
          </button>
        </header>
        <div className="p-4 sm:p-6">{children}</div>
      </section>
    </div>
  )
}
