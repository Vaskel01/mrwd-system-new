import AppIcon from './AppIcon'

export default function MetricCard({ label, value, detail, icon, onClick, accent, selected = false }) {
  const Component = onClick ? 'button' : 'div'
  return (
    <Component
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      aria-pressed={onClick ? selected : undefined}
      className={`card h-full w-full rounded-xl p-5 text-left ${selected ? 'border-navy-400 ring-2 ring-navy-700' : ''} ${onClick ? 'transition hover:-translate-y-0.5 hover:border-navy-300 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-navy-300 focus:ring-offset-2' : ''}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={`font-display text-3xl font-black ${accent || 'text-navy-900'}`}>{value}</p>
          <p className="mt-1 text-sm font-bold text-gray-700">{label}</p>
          {detail ? <p className="mt-2 text-sm leading-5 text-gray-500">{detail}</p> : null}
        </div>
        {icon ? (
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-navy-50 text-navy-700" aria-hidden="true">
            <AppIcon name={icon} className="h-5 w-5" />
          </div>
        ) : null}
      </div>
    </Component>
  )
}
