export const DEPARTMENT_MODULES = Object.freeze({
  commercial: {
    code: 'COMMERCIAL',
    name: 'Commercial Services Department',
    shortName: 'NSCCCD',
    divisionCode: 'NSCCCD',
    divisionName: 'New Service Connection and Customer Care Division (NSCCCD)',
    description: 'NSCCCD receives and reviews customer complaints under Commercial Services, manages customer accounts and billing records, and routes field-related complaints to WDLCD.',
    links: [
      { to: '/commercial/complaints', label: 'Complaint review', description: 'Check new complaints, confirm the details and priority, then send field-related complaints to WDLCD.', icon: 'clipboard' },
      { to: '/commercial/accounts-billing', label: 'Accounts & billing', description: 'Manage customer account validation, billing records, and billing imports.', icon: 'billing' },
      { to: '/commercial/service-advisories', label: 'Service advisories', description: 'Create and manage service notices that customers can see.', icon: 'announcement' },
      { to: '/commercial/reports', label: 'Complaint analytics', description: 'Review demand, priorities, aging, outcomes, customer feedback, and follow-up exceptions.', icon: 'chart' },
      { to: '/commercial/export-center', label: 'Exports & scheduled reports', description: 'Export filtered complaint records and create recurring report schedules.', icon: 'download' },
    ],
  },
  ecmd: {
    code: 'ECMD',
    name: 'Engineering, Construction and Maintenance Department (ECMD)',
    shortName: 'WDLCD',
    divisionCode: 'WDLCD',
    divisionName: 'Water Distribution and Leakage Control Division (WDLCD)',
    description: 'WDLCD receives field-related complaints under ECMD, assigns Maintenance Crews or Maintenance Personnel, monitors field work, and verifies completion.',
    links: [
      { to: '/ecmd/dispatch', label: 'Complaint dispatch', description: 'Review complaints that are ready for field work and assign Maintenance Personnel or crews.', icon: 'assignment' },
      { to: '/ecmd/field-operations', label: 'Field operations analytics', description: 'Monitor queue aging, throughput, staff capacity, recurring problem areas, incidents, and completed repairs.', icon: 'tool' },
      { to: '/ecmd/crews', label: 'Crew management', description: 'Manage crews, members, temporary substitutions, and reusable completion-note templates.', icon: 'users' },
      { to: '/ecmd/availability', label: 'Availability calendar', description: 'Check shifts and availability before assigning field work.', icon: 'calendar' },
    ],
  },
})

export function departmentModule(key) {
  return DEPARTMENT_MODULES[key] || null
}
