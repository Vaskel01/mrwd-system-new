export const DEPARTMENT_MODULES = Object.freeze({
  commercial: {
    code: 'COMMERCIAL',
    name: 'Commercial Services Department',
    shortName: 'Commercial Services',
    description: 'Review complaints, manage customer accounts and billing records, publish service advisories, and view complaint reports.',
    links: [
      { to: '/commercial/complaints', label: 'Complaint review', description: 'Check new complaints, confirm the details and priority, then send eligible complaints to ECMD.', icon: 'clipboard' },
      { to: '/commercial/accounts-billing', label: 'Accounts & billing', description: 'Manage customer account validation, billing records, and billing imports.', icon: 'billing' },
      { to: '/commercial/service-advisories', label: 'Service advisories', description: 'Create and manage service notices that customers can see.', icon: 'announcement' },
      { to: '/commercial/reports', label: 'Complaint reports', description: 'Review complaint volume, priorities, outcomes, and customer feedback.', icon: 'chart' },
      { to: '/commercial/export-center', label: 'Exports & scheduled reports', description: 'Export filtered complaint records and create recurring report schedules.', icon: 'download' },
    ],
  },
  ecmd: {
    code: 'ECMD',
    name: 'Engineering, Construction and Maintenance Department (ECMD)',
    shortName: 'ECMD',
    description: 'Assign field work, monitor active repairs, manage crews and resources, and verify completed work.',
    links: [
      { to: '/ecmd/dispatch', label: 'Complaint dispatch', description: 'Review complaints that are ready for field work and assign Maintenance Personnel or crews.', icon: 'assignment' },
      { to: '/ecmd/field-operations', label: 'Field operations', description: 'Monitor active work, staff workload, recurring problem areas, incidents, materials, and completed repairs.', icon: 'tool' },
      { to: '/ecmd/crews', label: 'Crew management', description: 'Manage crews, members, temporary substitutions, and reusable completion-note templates.', icon: 'users' },
      { to: '/ecmd/availability', label: 'Availability calendar', description: 'Check shifts and availability before assigning field work.', icon: 'calendar' },
    ],
  },
})

export function departmentModule(key) {
  return DEPARTMENT_MODULES[key] || null
}
