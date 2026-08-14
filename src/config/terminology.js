export const TERMS = Object.freeze({
  CUSTOMER: 'Customer',
  COMMERCIAL_DEPARTMENT: 'Commercial Department',
  COMMERCIAL_STAFF: 'Commercial Department Staff',
  ECMD: 'Engineering, Construction and Maintenance Department (ECMD)',
  ECMD_SHORT: 'ECMD',
  ECMD_STAFF: 'ECMD Staff',
  SYSTEM_ADMINISTRATION: 'System Administration',
  SYSTEM_SUPERVISOR: 'System Supervisor',
  DEPARTMENT_STAFF: 'Department Staff',
  MAINTENANCE_PERSONNEL: 'Maintenance Personnel',
  TEAM_LEADER: 'Team Leader',
  CREW: 'Maintenance Crew',
  COMPLAINT: 'Complaint',
  REFERENCE_NUMBER: 'Complaint Reference Number',
  IMPORTANT_ADVISORY: 'Important Advisory',
  IN_PROGRESS: 'In Progress',
  NO_WATER: 'No Water',
})

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
  return 'Restricted Department Staff'
}

export function securityRoleLabel(role) {
  if (role === 'customer') return TERMS.CUSTOMER
  if (role === 'maintenance_personnel') return TERMS.MAINTENANCE_PERSONNEL
  if (role === 'admin') return TERMS.DEPARTMENT_STAFF
  return 'Staff Account'
}
