import AppIcon from './AppIcon'

export default function MetricCard({ label, value, detail, icon, onClick, accent, selected = false }) {
  const Component = onClick ? 'button' : 'div'
  return (
    <Component
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      aria-pressed={onClick ? selected : undefined}
      className={`card group h-full w-full p-4 text-left sm:p-5 ${selected ? 'ring-2 ring-md-primary ring-offset-2' : ''} ${onClick ? 'transition-all duration-300 ease-[cubic-bezier(.2,0,0,1)] hover:scale-[1.02] hover:shadow-md-2 focus:outline-none focus:ring-2 focus:ring-md-primary focus:ring-offset-2 active:scale-95' : ''}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={`font-display text-3xl font-bold leading-none tracking-tight ${accent || 'text-navy-900'}`}>{value}</p>
          <p className="mt-1 text-sm font-medium text-gray-700">{label}</p>
          {detail ? <p className="mt-2 text-sm leading-5 text-gray-500">{detail}</p> : null}
        </div>
        {icon ? (
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-md-secondary text-md-on-secondary transition-transform duration-300 ease-[cubic-bezier(.2,0,0,1)] group-hover:scale-110" aria-hidden="true">
            <AppIcon name={icon} className="h-5 w-5" />
          </div>
        ) : null}
      </div>
    </Component>
  )
}
