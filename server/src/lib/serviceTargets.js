export function calculateServiceDueAt(startedAt, resolutionHours) {
  const start = new Date(startedAt)
  const hours = Number(resolutionHours)
  if (Number.isNaN(start.getTime()) || !Number.isFinite(hours) || hours <= 0) {
    throw new Error('A valid start date and positive resolution target are required.')
  }
  return new Date(start.getTime() + hours * 3_600_000).toISOString()
}

export function overdueServiceState(dueAt, escalationHours, nowValue = Date.now()) {
  const due = new Date(dueAt).getTime()
  const now = new Date(nowValue).getTime()
  const escalation = Number(escalationHours)
  if (!Number.isFinite(due) || !Number.isFinite(now) || !Number.isFinite(escalation) || escalation <= 0) {
    throw new Error('Valid service-target values are required.')
  }
  if (now <= due) return { overdue: false, hoursOverdue: 0, severity: null }
  const hoursOverdue = Math.max(1, Math.floor((now - due) / 3_600_000))
  return { overdue: true, hoursOverdue, severity: hoursOverdue >= escalation ? 'critical' : 'warning' }
}
