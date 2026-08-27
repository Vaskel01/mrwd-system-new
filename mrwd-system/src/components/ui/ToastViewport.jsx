import AppIcon from './AppIcon'
import { useToastStore } from '../../store/toastStore'

const TONES = {
  success: { wrap: 'border-green-200 bg-green-50 text-green-900', icon: 'check', iconWrap: 'bg-green-600 text-white' },
  error: { wrap: 'border-red-200 bg-red-50 text-red-900', icon: 'alert', iconWrap: 'bg-red-600 text-white' },
  warning: { wrap: 'border-amber-200 bg-amber-50 text-amber-900', icon: 'alert', iconWrap: 'bg-amber-500 text-white' },
  info: { wrap: 'border-blue-200 bg-blue-50 text-blue-900', icon: 'info', iconWrap: 'bg-blue-600 text-white' },
}

export default function ToastViewport() {
  const toasts = useToastStore(state => state.toasts)
  const dismiss = useToastStore(state => state.dismiss)
  if (!toasts.length) return null

  return (
    <div className="pointer-events-none fixed inset-x-3 top-16 z-[90] flex flex-col items-end gap-2 sm:left-auto sm:right-4 sm:w-[380px]" aria-live="polite" aria-atomic="false">
      {toasts.map(toast => {
        const tone = TONES[toast.tone] || TONES.info
        return (
          <div key={toast.id} className={`pointer-events-auto w-full rounded-xl border px-3.5 py-3 shadow-xl backdrop-blur ${tone.wrap}`} role={toast.tone === 'error' ? 'alert' : 'status'}>
            <div className="flex items-start gap-3">
              <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${tone.iconWrap}`}><AppIcon name={tone.icon} className="h-4 w-4" /></span>
              <div className="min-w-0 flex-1">
                {toast.title && <p className="text-xs font-black uppercase tracking-wide">{toast.title}</p>}
                <p className="text-sm font-semibold leading-relaxed">{toast.message}</p>
              </div>
              <button type="button" onClick={() => dismiss(toast.id)} className="rounded p-1 opacity-60 transition hover:bg-black/5 hover:opacity-100" aria-label="Dismiss notification"><AppIcon name="close" className="h-4 w-4" /></button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
