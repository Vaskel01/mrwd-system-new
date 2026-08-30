import AppIcon from '../ui/AppIcon'

const ACCENTS = {
  navy: { value: 'text-navy-900', icon: 'bg-navy-100 text-navy-800', bar: 'bg-navy-700' },
  blue: { value: 'text-brand-700', icon: 'bg-blue-100 text-blue-800', bar: 'bg-brand-500' },
  green: { value: 'text-green-700', icon: 'bg-green-100 text-green-800', bar: 'bg-green-600' },
  amber: { value: 'text-amber-700', icon: 'bg-amber-100 text-amber-800', bar: 'bg-amber-500' },
  red: { value: 'text-red-700', icon: 'bg-red-100 text-red-800', bar: 'bg-red-600' },
}

const SIGNAL_STYLES = {
  good: 'border-green-200 bg-green-50 text-green-900',
  watch: 'border-amber-200 bg-amber-50 text-amber-900',
  urgent: 'border-red-200 bg-red-50 text-red-900',
  info: 'border-blue-200 bg-blue-50 text-blue-900',
}

export function AnalyticsKpi({ label, value, detail, icon = 'chart', accent = 'navy', footer }) {
  const colors = ACCENTS[accent] || ACCENTS.navy
  return (
    <article className="card rounded-2xl p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-[0.12em] text-gray-500">{label}</p>
          <p className={`mt-2 font-display text-3xl font-black tracking-tight ${colors.value}`}>{value}</p>
        </div>
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${colors.icon}`} aria-hidden="true">
          <AppIcon name={icon} className="h-5 w-5" />
        </span>
      </div>
      {detail ? <p className="mt-2 text-xs leading-5 text-gray-500">{detail}</p> : null}
      {footer ? <div className="mt-3 border-t border-gray-100 pt-3 text-xs font-bold text-gray-600">{footer}</div> : null}
    </article>
  )
}

export function AnalyticsSectionHeading({ eyebrow, title, description, aside }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        {eyebrow ? <p className="text-xs font-black uppercase tracking-[0.16em] text-brand-700">{eyebrow}</p> : null}
        <h2 className="mt-0.5 font-display text-lg font-black text-navy-900">{title}</h2>
        {description ? <p className="mt-1 max-w-3xl text-xs leading-5 text-gray-500">{description}</p> : null}
      </div>
      {aside ? <div className="shrink-0">{aside}</div> : null}
    </div>
  )
}

export function RankedBarList({ items = [], total, emptyLabel = 'No data is available for this period.', maxItems = 8 }) {
  const normalized = Array.isArray(items)
    ? items
    : Object.entries(items).map(([label, value]) => ({ label, value }))
  const ranked = [...normalized]
    .map(item => ({ ...item, value: Number(item.value ?? item.count) || 0 }))
    .filter(item => item.value > 0)
    .sort((left, right) => right.value - left.value)
    .slice(0, maxItems)
  const maximum = Math.max(1, ...ranked.map(item => item.value))
  const denominator = total ?? ranked.reduce((sum, item) => sum + item.value, 0)

  if (!ranked.length) return <p className="rounded-xl border border-dashed border-gray-200 px-4 py-8 text-center text-sm text-gray-500">{emptyLabel}</p>

  return (
    <div className="space-y-3.5">
      {ranked.map((item, index) => {
        const colors = ACCENTS[item.accent] || ACCENTS.blue
        const share = denominator ? Math.round(item.value / denominator * 100) : 0
        return (
          <div key={item.label}>
            <div className="mb-1.5 flex items-center justify-between gap-3 text-xs">
              <span className="min-w-0 truncate font-bold text-gray-700"><span className="mr-2 text-gray-500">{index + 1}</span>{item.label}</span>
              <span className="shrink-0 font-black text-navy-900">{item.value}<span className="ml-1 font-medium text-gray-500">· {share}%</span></span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-gray-100" role="img" aria-label={`${item.label}: ${item.value}, ${share}%`}>
              <div className={`h-full rounded-full ${colors.bar}`} style={{ width: `${Math.max(4, item.value / maximum * 100)}%` }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function DistributionBar({ items = [], total, emptyLabel = 'No distribution data is available.' }) {
  const normalized = items.map(item => ({ ...item, value: Number(item.value) || 0 })).filter(item => item.value > 0)
  const denominator = total ?? normalized.reduce((sum, item) => sum + item.value, 0)
  if (!normalized.length || !denominator) return <p className="text-sm text-gray-500">{emptyLabel}</p>

  return (
    <div>
      <div className="flex h-3 overflow-hidden rounded-full bg-gray-100" aria-label="Distribution summary">
        {normalized.map(item => {
          const colors = ACCENTS[item.accent] || ACCENTS.navy
          return <span key={item.label} className={colors.bar} style={{ width: `${item.value / denominator * 100}%` }} title={`${item.label}: ${item.value}`} />
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
        {normalized.map(item => {
          const colors = ACCENTS[item.accent] || ACCENTS.navy
          return <span key={item.label} className="inline-flex items-center gap-1.5 text-xs text-gray-600"><span className={`h-2.5 w-2.5 rounded-full ${colors.bar}`} /><b className="text-gray-800">{item.value}</b> {item.label}</span>
        })}
      </div>
    </div>
  )
}

export function AnalyticsSignal({ title, detail, tone = 'info', icon = 'info', action }) {
  return (
    <div className={`rounded-xl border px-3.5 py-3 ${SIGNAL_STYLES[tone] || SIGNAL_STYLES.info}`}>
      <div className="flex items-start gap-2.5">
        <AppIcon name={icon} className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-black">{title}</p>
          <p className="mt-1 text-xs leading-5 opacity-80">{detail}</p>
          {action ? <div className="mt-2">{action}</div> : null}
        </div>
      </div>
    </div>
  )
}

export function AnalyticsTable({ columns, rows, emptyLabel = 'No records are available for this period.', rowKey }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200">
      <table className="min-w-full text-left text-sm">
        <thead><tr>{columns.map(column => <th key={column.key} className="whitespace-nowrap px-3 py-3 text-xs font-black uppercase tracking-wider text-gray-500">{column.label}</th>)}</tr></thead>
        <tbody className="divide-y divide-gray-100">
          {rows.length ? rows.map((row, index) => (
            <tr key={rowKey ? rowKey(row) : index} className="hover:bg-gray-50">
              {columns.map(column => <td key={column.key} className={`px-3 py-3 align-top ${column.className || ''}`}>{column.render ? column.render(row) : row[column.key]}</td>)}
            </tr>
          )) : <tr><td colSpan={columns.length} className="px-4 py-8 text-center text-sm text-gray-500">{emptyLabel}</td></tr>}
        </tbody>
      </table>
    </div>
  )
}
