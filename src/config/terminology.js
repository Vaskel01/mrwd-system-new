export const TERMS = Object.freeze({
  CUSTOMER: 'Customer',
  COMMERCIAL_SERVICES: 'Commercial Services',
  COMMERCIAL_SERVICES_DEPARTMENT: 'Commercial Services Department',
  COMMERCIAL_DEPARTMENT: 'Commercial Services Department',
  COMMERCIAL_STAFF: 'Commercial Services Staff (NSCCCD)',
  NSCCCD: 'New Service Connection and Customer Care Division (NSCCCD)',
  NSCCCD_SHORT: 'NSCCCD',
  ACCOUNTS_BILLING: 'Accounts & billing',
  SERVICE_ADVISORIES: 'Service advisories',
  COMPLAINT_ANALYTICS: 'Complaint analytics',
  EXPORTS_SCHEDULES: 'Exports & schedules',
  ECMD: 'Engineering, Construction and Maintenance Department (ECMD)',
  ECMD_SHORT: 'ECMD',
  ECMD_STAFF: 'ECMD Staff (WDLCD)',
  WDLCD: 'Water Distribution and Leakage Control Division (WDLCD)',
  WDLCD_SHORT: 'WDLCD',
  SYSTEM_ADMINISTRATION: 'System Administration',
  SYSTEM_SUPERVISOR: 'System Supervisor',
  DEPARTMENT_STAFF: 'Staff Account',
  MAINTENANCE_PERSONNEL: 'Maintenance Personnel',
  TEAM_LEADER: 'Team Leader',
  CREW_MEMBER: 'Maintenance Crew Member',
  CREW: 'Maintenance Crew',
  COMPLAINT: 'Complaint',
  REFERENCE_NUMBER: 'Complaint reference number',
  IMPORTANT_ADVISORY: 'Important Advisory',
  NO_WATER: 'No Water',
})

export const STATUS_LABELS = Object.freeze({
  pending: 'Pending review',
  forwarded: 'Sent to WDLCD',
  assigned: 'Assigned',
  en_route: 'In progress',
  in_progress: 'In progress',
  awaiting_verification: 'Resolved',
  resolved: 'Resolved',
  completed: 'Resolved',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
  blocked: 'Needs attention',
  merged: 'Merged',
})

export const PRIORITY_LABELS = Object.freeze({
  high: 'High',
  medium: 'Medium',
  low: 'Low',
})

export const AVAILABILITY_LABELS = Object.freeze({
  scheduled: 'Scheduled',
  available: 'Available',
  busy: 'Busy',
  on_leave: 'On leave',
  off_duty: 'Off duty',
})

function fallbackLabel(value, fallback) {
  const normalized = String(value || '').trim()
  if (!normalized) return fallback
  const words = normalized.replaceAll('_', ' ')
  return `${words.charAt(0).toUpperCase()}${words.slice(1)}`
}

export function statusLabel(status) {
  return STATUS_LABELS[status] || fallbackLabel(status, 'Status not set')
}

export function priorityLabel(priority) {
  return PRIORITY_LABELS[priority] || fallbackLabel(priority, 'Not set')
}

export function availabilityLabel(availability) {
  return AVAILABILITY_LABELS[availability] || fallbackLabel(availability, 'Not set')
}

export function departmentDisplayName(department) {
  const code = String(department?.code || department || '').trim().toUpperCase()
  if (code === 'COMMERCIAL') return TERMS.COMMERCIAL_SERVICES_DEPARTMENT
  if (code === 'ECMD') return TERMS.ECMD
  return department?.name || String(department || 'Department')
}


export function divisionDisplayName(division) {
  const code = String(division?.code || division || '').trim().toUpperCase()
  if (code === 'NSCCCD') return TERMS.NSCCCD
  if (code === 'WDLCD') return TERMS.WDLCD
  return division?.name || String(division || 'Division')
}

export function staffAccessLabel(account) {
  if (!account) return 'Restricted Staff Account'
  if (account.role === 'customer') return TERMS.CUSTOMER
  if (account.role === 'maintenance_personnel') return TERMS.MAINTENANCE_PERSONNEL
  if (['manager', 'supervisor'].includes(String(account.staff_position || '').toLowerCase())) {
    return TERMS.SYSTEM_SUPERVISOR
  }
  const departmentCode = String(account.department?.code || account.department_code || '').toUpperCase()
  if (departmentCode === 'COMMERCIAL') return TERMS.COMMERCIAL_STAFF
  if (departmentCode === 'ECMD') return TERMS.ECMD_STAFF
  return 'Restricted Staff Account'
}

export function securityRoleLabel(role) {
  if (role === 'customer') return TERMS.CUSTOMER
  if (role === 'maintenance_personnel') return TERMS.MAINTENANCE_PERSONNEL
  if (role === 'admin') return 'Staff Account'
  return 'Staff Account'
}
