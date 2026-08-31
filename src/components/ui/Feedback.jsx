import { friendlyError } from '../../lib/friendlyError'
import AppIcon from './AppIcon'

export function Spinner({ className = 'w-5 h-5 border-2 border-brand-600' }) {
  return <span className={`${className} inline-block border-t-transparent rounded-full animate-spin`} aria-hidden="true" />
}

// Full-section loading state — drop in wherever a page/panel is
// waiting on its first fetch to resolve.
export function PageLoader({ label = 'Loading…', compact = false }) {
  if (compact) {
    return (
      <div className="flex items-center justify-center gap-3 py-10" role="status" aria-live="polite">
        <Spinner className="w-6 h-6 border-[3px] border-brand-600" />
        <p className="text-sm font-medium text-gray-600">{label}</p>
      </div>
    )
  }

  return (
    <div className="space-y-5 py-2" role="status" aria-live="polite" aria-label={label}>
      <span className="sr-only">{label}</span>
      <div className="h-32 rounded-2xl bg-gray-200 motion-safe:animate-pulse" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map(item => <div key={item} className="h-28 rounded-xl bg-gray-200 motion-safe:animate-pulse" />)}
      </div>
      <div className="card rounded-xl p-5">
        <div className="h-5 w-44 rounded bg-gray-200 motion-safe:animate-pulse" />
        <div className="mt-5 space-y-3">
          {[0, 1, 2, 3].map(item => <div key={item} className="h-14 rounded-lg bg-gray-100 motion-safe:animate-pulse" />)}
        </div>
      </div>
    </div>
  )
}

// "Nothing here yet" state — for empty lists, empty search results, etc.
export function EmptyState({ icon = <AppIcon name="document" className="h-10 w-10" />, title, description, action }) {
  return (
    <div className="bg-white border border-dashed border-gray-300 rounded-xl p-8 sm:p-12 text-center">
      <div className="mb-3 flex justify-center text-4xl" aria-hidden="true">{icon}</div>
      <h2 className="font-display font-bold text-gray-800">{title}</h2>
      {description && <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-gray-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

// Consistent error display — runs the raw message through
// friendlyError() so people see plain language instead of a stack
// trace or a raw Postgres/Supabase error string.
export function ErrorBanner({ message, onRetry, className = '' }) {
  return (
    <div role="alert" className={`bg-red-50 border-l-4 border-red-500 text-red-800 text-sm px-4 py-3.5 font-medium flex items-center justify-between gap-3 ${className}`}>
      <div className="flex items-center gap-2.5">
        <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd"/>
        </svg>
        <span>{friendlyError(message)}</span>
      </div>
      {onRetry && (
        <button onClick={onRetry} className="text-red-700 font-bold underline shrink-0 hover:text-red-900">
          Try again
        </button>
      )}
    </div>
  )
}
