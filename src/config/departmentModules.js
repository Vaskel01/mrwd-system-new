export const DEPARTMENT_MODULES = Object.freeze({
  commercial: {
    code: 'COMMERCIAL',
    name: 'Commercial Services Department',
    shortName: 'Commercial Services',
    description: 'Review customer complaints, verify complaint details and classification, manage customer account and billing concerns, publish service advisories, and review complaint reports.',
    links: [
      { to: '/commercial/complaints', label: 'Complaint Review', description: 'Review submitted complaints, verify details, classification, and priority before field handling.', icon: 'clipboard' },
      { to: '/commercial/accounts-billing', label: 'Accounts & Billing', description: 'Handle customer account and billing information connected to complaint concerns.', icon: 'billing' },
      { to: '/commercial/service-advisories', label: 'Service Advisories', description: 'Publish and manage customer-facing MRWD service advisories.', icon: 'announcement' },
      { to: '/commercial/reports', label: 'Complaint Reports', description: 'View complaint trends, status totals, priority distribution, and resolution performance.', icon: 'chart' },
    ],
  },
  ecmd: {
    code: 'ECMD',
    name: 'Engineering, Construction and Maintenance Department (ECMD)',
    shortName: 'ECMD',
    description: 'Receive complaints ready for field action, assign Maintenance Personnel or crews, monitor active work, manage field resources, and track complaint resolution.',
    links: [
      { to: '/ecmd/dispatch', label: 'Complaint Dispatch', description: 'Assign complaints to Maintenance Personnel and ECMD crews for field action.', icon: 'assignment' },
      { to: '/ecmd/field-operations', label: 'Field Operations', description: 'Monitor active assignments, crew availability, service targets, escalations, and materials.', icon: 'tool' },
    ],
  },
})

export function departmentModule(key) {
  return DEPARTMENT_MODULES[key] || null
}
