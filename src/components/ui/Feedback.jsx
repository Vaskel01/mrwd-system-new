import { friendlyError } from '../../lib/friendlyError'

export function Spinner({ className = 'w-5 h-5 border-2 border-brand-600' }) {
  return <div className={`${className} border-t-transparent rounded-full animate-spin`} />
}

// Full-section loading state — drop in wherever a page/panel is
// waiting on its first fetch to resolve.
export function PageLoader({ label = 'Loading...' }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-3">
      <Spinner className="w-8 h-8 border-[3px] border-brand-600" />
      <p className="text-sm text-gray-400 font-medium">{label}</p>
    </div>
  )
}

// "Nothing here yet" state — for empty lists, empty search results, etc.
export function EmptyState({ icon = '📭', title, description, action }) {
  return (
    <div className="bg-white border border-dashed border-gray-300 p-12 text-center">
      <p className="text-4xl mb-3">{icon}</p>
      <p className="font-bold text-gray-500">{title}</p>
      {description && <p className="text-sm text-gray-400 mt-1">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

// Consistent error display — runs the raw message through
// friendlyError() so people see plain language instead of a stack
// trace or a raw Postgres/Supabase error string.
export function ErrorBanner({ message, onRetry, className = '' }) {
  return (
    <div className={`bg-red-50 border-l-4 border-red-500 text-red-800 text-sm px-4 py-3.5 font-medium flex items-center justify-between gap-3 ${className}`}>
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
