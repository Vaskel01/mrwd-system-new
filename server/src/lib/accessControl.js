export const CAPABILITIES = Object.freeze({
  SUPERVISOR_DASHBOARD: 'system.dashboard',
  COMMERCIAL_COMPLAINTS: 'commercial.complaints',
  COMMERCIAL_REPORTS: 'commercial.reports',
  COMMERCIAL_BILLING: 'commercial.billing',
  COMMERCIAL_ANNOUNCEMENTS: 'commercial.announcements',
  COMMERCIAL_ARCHIVE_REQUEST: 'commercial.archive_request',
  ECMD_DISPATCH: 'ecmd.dispatch',
  ECMD_OPERATIONS: 'ecmd.operations',
  ECMD_REPORTS: 'ecmd.maintenance_reports',
  SYSTEM_STAFF: 'system.staff',
  SYSTEM_AUDIT: 'system.audit',
  SYSTEM_APPROVALS: 'system.approvals',
  SYSTEM_DEPARTMENTS: 'system.departments',
})

const COMMERCIAL_CAPABILITIES = [
  CAPABILITIES.COMMERCIAL_COMPLAINTS,
  CAPABILITIES.COMMERCIAL_REPORTS,
  CAPABILITIES.COMMERCIAL_BILLING,
  CAPABILITIES.COMMERCIAL_ANNOUNCEMENTS,
  CAPABILITIES.COMMERCIAL_ARCHIVE_REQUEST,
]

const ECMD_CAPABILITIES = [
  CAPABILITIES.ECMD_DISPATCH,
  CAPABILITIES.ECMD_OPERATIONS,
  CAPABILITIES.ECMD_REPORTS,
]

const SYSTEM_CAPABILITIES = [
  CAPABILITIES.SUPERVISOR_DASHBOARD,
  CAPABILITIES.SYSTEM_STAFF,
  CAPABILITIES.SYSTEM_AUDIT,
  CAPABILITIES.SYSTEM_APPROVALS,
  CAPABILITIES.SYSTEM_DEPARTMENTS,
]

export function departmentCodeFor(user) {
  return String(user?.department?.code || user?.department_code || '').trim().toUpperCase()
}

export function isSystemSupervisor(user) {
  if (user?.role !== 'admin') return false
  const position = String(user?.staff_position || '').trim().toLowerCase()
  return ['manager', 'supervisor'].includes(position)
}

export function capabilitiesForUser(user) {
  if (user?.role !== 'admin') return []
  if (isSystemSupervisor(user)) return SYSTEM_CAPABILITIES

  const departmentCode = departmentCodeFor(user)
  if (departmentCode === 'COMMERCIAL') return COMMERCIAL_CAPABILITIES
  if (departmentCode === 'ECMD') return ECMD_CAPABILITIES
  return []
}

export function hasCapability(user, ...required) {
  if (!required.length) return true
  const granted = new Set(capabilitiesForUser(user))
  return required.some(capability => granted.has(capability))
}
