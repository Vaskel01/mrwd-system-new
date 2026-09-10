export function formatPeso(value) {
  if (value === null || value === undefined || value === '' || !Number.isFinite(Number(value))) return 'Not provided'
  return '₱' + Number(value).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function billDate(value) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return 'Not provided'
  const date = new Date(`${value}T00:00:00Z`)
  return Number.isFinite(date.getTime()) ? date.toLocaleDateString('en-PH', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' }) : 'Not provided'
}

export function isOverdue(dueDate, status, now = new Date()) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
  return status === 'unpaid' && Boolean(dueDate) && dueDate < today
}
