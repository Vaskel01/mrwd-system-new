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

const commercial = [
  CAPABILITIES.COMMERCIAL_COMPLAINTS,
  CAPABILITIES.COMMERCIAL_REPORTS,
  CAPABILITIES.COMMERCIAL_BILLING,
  CAPABILITIES.COMMERCIAL_ANNOUNCEMENTS,
  CAPABILITIES.COMMERCIAL_ARCHIVE_REQUEST,
]
const ecmd = [CAPABILITIES.ECMD_DISPATCH, CAPABILITIES.ECMD_OPERATIONS, CAPABILITIES.ECMD_REPORTS]
const system = [CAPABILITIES.SUPERVISOR_DASHBOARD, CAPABILITIES.SYSTEM_STAFF, CAPABILITIES.SYSTEM_AUDIT, CAPABILITIES.SYSTEM_APPROVALS, CAPABILITIES.SYSTEM_DEPARTMENTS]

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
  if (isSystemSupervisor(user)) return [...new Set([...commercial, ...ecmd, ...system])]
  if (departmentCodeFor(user) === 'COMMERCIAL') return commercial
  if (departmentCodeFor(user) === 'ECMD') return ecmd
  return []
}

export function hasCapability(user, ...required) {
  if (!required.length) return true
  const granted = new Set(capabilitiesForUser(user))
  return required.some(capability => granted.has(capability))
}

export function homeForUser(user) {
  if (user?.role === 'customer') return '/customer/my-complaints'
  if (user?.role === 'maintenance_personnel') return '/maintenance/tasks'
  if (hasCapability(user, CAPABILITIES.SUPERVISOR_DASHBOARD)) return '/system/dashboard'
  if (hasCapability(user, CAPABILITIES.COMMERCIAL_COMPLAINTS)) return '/commercial/complaints'
  if (hasCapability(user, CAPABILITIES.ECMD_DISPATCH)) return '/ecmd/dispatch'
  return '/profile'
}
