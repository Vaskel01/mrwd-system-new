import AppIcon from '../ui/AppIcon'

const ACCENTS = {
  navy: { value: 'text-navy-900', icon: 'bg-navy-100 text-navy-800', bar: 'bg-navy-700', chart: 'text-navy-700' },
  blue: { value: 'text-brand-700', icon: 'bg-blue-100 text-blue-800', bar: 'bg-brand-500', chart: 'text-brand-500' },
  green: { value: 'text-green-700', icon: 'bg-green-100 text-green-800', bar: 'bg-green-600', chart: 'text-green-600' },
  amber: { value: 'text-amber-700', icon: 'bg-amber-100 text-amber-800', bar: 'bg-amber-500', chart: 'text-amber-500' },
  red: { value: 'text-red-700', icon: 'bg-red-100 text-red-800', bar: 'bg-red-600', chart: 'text-red-600' },
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
    <article className="card p-4 sm:p-5">
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

function normalizedChartItems(items) {
  return items
    .map(item => ({ ...item, value: Number(item.value) || 0 }))
    .filter(item => item.value > 0)
}

function chartColor(accent) {
  return ACCENTS[accent] || ACCENTS.navy
}

export function DonutChart({ items = [], total, centerLabel = 'Total', centerValue, emptyLabel = 'No chart data is available.', ariaLabel = 'Distribution chart' }) {
  const normalized = normalizedChartItems(items)
  const denominator = Number(total) || normalized.reduce((sum, item) => sum + item.value, 0)
  if (!normalized.length || !denominator) return <p className="rounded-xl border border-dashed border-gray-200 px-4 py-8 text-center text-sm text-gray-500">{emptyLabel}</p>

  const radius = 54
  const circumference = 2 * Math.PI * radius
  const segments = normalized.map((item, index) => {
    const share = item.value / denominator
    const offset = normalized.slice(0, index).reduce((sum, previous) => sum + previous.value / denominator * circumference, 0)
    return { ...item, share, offset, segmentLength: share * circumference }
  })

  return (
    <figure className="grid gap-5 sm:grid-cols-[11rem_minmax(0,1fr)] sm:items-center">
      <div className="mx-auto w-full max-w-44">
        <svg viewBox="0 0 144 144" className="h-auto w-full" role="img" aria-label={ariaLabel}>
          <circle cx="72" cy="72" r={radius} fill="none" stroke="currentColor" strokeWidth="18" className="text-gray-100" />
          {segments.map(item => {
            return (
              <circle
                key={item.label}
                cx="72"
                cy="72"
                r={radius}
                fill="none"
                stroke="currentColor"
                strokeWidth="18"
                strokeDasharray={`${item.segmentLength} ${circumference - item.segmentLength}`}
                strokeDashoffset={-item.offset}
                transform="rotate(-90 72 72)"
                className={chartColor(item.accent).chart}
              >
                <title>{`${item.label}: ${item.value} (${Math.round(item.share * 100)}%)`}</title>
              </circle>
            )
          })}
          <text x="72" y="69" textAnchor="middle" className="fill-current text-2xl font-black text-navy-900">{centerValue ?? denominator}</text>
          <text x="72" y="86" textAnchor="middle" className="fill-current text-xs font-bold uppercase tracking-wider text-gray-500">{centerLabel}</text>
        </svg>
      </div>
      <figcaption className="space-y-2.5">
        {normalized.map(item => {
          const colors = chartColor(item.accent)
          const share = Math.round(item.value / denominator * 100)
          return (
            <div key={item.label} className="flex items-center justify-between gap-3 text-xs">
              <span className="inline-flex min-w-0 items-center gap-2 font-bold text-gray-700"><span className={`h-2.5 w-2.5 shrink-0 rounded-full ${colors.bar}`} /><span>{item.label}</span></span>
              <span className="shrink-0 font-black text-navy-900">{item.value}<span className="ml-1 font-medium text-gray-500">· {share}%</span></span>
            </div>
          )
        })}
      </figcaption>
    </figure>
  )
}

function niceMaximum(value) {
  if (value <= 5) return Math.max(1, Math.ceil(value))
  const magnitude = 10 ** Math.floor(Math.log10(value))
  const normalized = value / magnitude
  const step = normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10
  return step * magnitude
}

export function TimeSeriesChart({ data = [], series = [], xKey = 'label', ariaLabel = 'Trend chart', emptyLabel = 'No trend data is available for this period.' }) {
  const usableSeries = series.filter(item => item?.key && item?.label)
  const points = data.map(item => ({
    ...item,
    ...Object.fromEntries(usableSeries.map(seriesItem => [seriesItem.key, Number(item[seriesItem.key]) || 0])),
  }))
  const hasValues = points.some(item => usableSeries.some(seriesItem => item[seriesItem.key] > 0))
  if (!points.length || !usableSeries.length || !hasValues) return <p className="rounded-xl border border-dashed border-gray-200 px-4 py-12 text-center text-sm text-gray-500">{emptyLabel}</p>

  const width = 680
  const height = 260
  const plot = { left: 44, right: 14, top: 16, bottom: 44 }
  const plotWidth = width - plot.left - plot.right
  const plotHeight = height - plot.top - plot.bottom
  const maximum = niceMaximum(Math.max(...points.flatMap(item => usableSeries.map(seriesItem => item[seriesItem.key]))))
  const xFor = index => points.length === 1 ? plot.left + plotWidth / 2 : plot.left + index / (points.length - 1) * plotWidth
  const yFor = value => plot.top + plotHeight - value / maximum * plotHeight
  const labelStep = Math.max(1, Math.ceil((points.length - 1) / 5))
  const labelIndexes = new Set(points.map((_, index) => index).filter(index => index === 0 || index === points.length - 1 || index % labelStep === 0))
  const gridValues = [...new Set([0, 0.25, 0.5, 0.75, 1].map(ratio => Math.round(maximum * ratio)))]

  return (
    <figure>
      <div className="mb-3 flex flex-wrap gap-x-4 gap-y-2">
        {usableSeries.map(seriesItem => {
          const colors = chartColor(seriesItem.accent)
          const latest = points.at(-1)?.[seriesItem.key] || 0
          return <span key={seriesItem.key} className="inline-flex items-center gap-2 text-xs font-bold text-gray-600"><span className={`h-0.5 w-5 rounded-full ${colors.bar}`} />{seriesItem.label}<span className="font-black text-navy-900">{latest}</span><span className="font-medium text-gray-500">latest</span></span>
        })}
      </div>
      <div className="overflow-x-auto rounded-xl border border-gray-100 bg-gray-50/60 px-1 py-2 sm:px-2">
        <svg viewBox={`0 0 ${width} ${height}`} className="h-auto min-w-[560px] w-full" role="img" aria-label={ariaLabel}>
          {gridValues.map(value => {
            const y = yFor(value)
            return (
              <g key={value}>
                <line x1={plot.left} x2={width - plot.right} y1={y} y2={y} stroke="currentColor" strokeWidth="1" className="text-gray-200" />
                <text x={plot.left - 8} y={y + 4} textAnchor="end" className="fill-current text-sm font-bold text-gray-500">{value}</text>
              </g>
            )
          })}
          {points.map((item, index) => labelIndexes.has(index) ? (
            <text key={`${item[xKey]}-${index}`} x={xFor(index)} y={height - 14} textAnchor={index === 0 ? 'start' : index === points.length - 1 ? 'end' : 'middle'} className="fill-current text-sm font-bold text-gray-500">{item[xKey]}</text>
          ) : null)}
          {usableSeries.map(seriesItem => {
            const colors = chartColor(seriesItem.accent)
            const path = points.map((item, index) => `${index ? 'L' : 'M'} ${xFor(index).toFixed(2)} ${yFor(item[seriesItem.key]).toFixed(2)}`).join(' ')
            return (
              <g key={seriesItem.key} className={colors.chart}>
                <path d={path} fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinejoin="round" strokeLinecap="round" />
                {points.map((item, index) => <circle key={`${seriesItem.key}-${index}`} cx={xFor(index)} cy={yFor(item[seriesItem.key])} r="4" fill="currentColor" stroke="white" strokeWidth="2"><title>{`${item[xKey]} · ${seriesItem.label}: ${item[seriesItem.key]}`}</title></circle>)}
              </g>
            )
          })}
        </svg>
      </div>
      <table className="sr-only">
        <caption>{ariaLabel}</caption>
        <thead><tr><th>{xKey}</th>{usableSeries.map(seriesItem => <th key={seriesItem.key}>{seriesItem.label}</th>)}</tr></thead>
        <tbody>{points.map((item, index) => <tr key={`${item[xKey]}-${index}`}><th>{item[xKey]}</th>{usableSeries.map(seriesItem => <td key={seriesItem.key}>{item[seriesItem.key]}</td>)}</tr>)}</tbody>
      </table>
    </figure>
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
      <table className="data-table min-w-[720px]">
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
