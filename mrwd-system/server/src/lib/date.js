const MANILA_TIME_ZONE = 'Asia/Manila'

export function manilaDateYmd(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: MANILA_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

export function addDaysYmd(ymd, days) {
  const [year, month, day] = String(ymd || '').split('-').map(Number)
  if (![year, month, day].every(Number.isFinite)) return ''
  const date = new Date(Date.UTC(year, month - 1, day + Number(days || 0), 12))
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`
}
