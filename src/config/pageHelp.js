import { TERMS } from './terminology.js'

const exact = (path, help) => ({ match: pathname => pathname === path, ...help })
const prefix = (path, help) => ({ match: pathname => pathname.startsWith(path), ...help })

const PAGE_HELP = [
  exact('/login', {
    title: 'Sign in',
    summary: 'Use your MRWD account email and password to open the workspace assigned to your account.',
    tips: [
      `${TERMS.CUSTOMER}s, ${TERMS.COMMERCIAL_STAFF}, ${TERMS.ECMD_STAFF}, ${TERMS.MAINTENANCE_PERSONNEL}, and ${TERMS.SYSTEM_SUPERVISOR}s use the same sign-in page.`,
      'If you forgot your password, use “Forgot password?” instead of creating another account.',
      'System Supervisors may be asked for an authenticator code after signing in.',
    ],
  }),
  exact('/register', {
    title: 'Create an account',
    summary: 'Create a customer account for submitting complaints, checking billing information, and tracking updates.',
    tips: [
      'Use an email address you can access because account and password messages are sent there.',
      'Staff accounts are created and assigned by System Administration; staff should not register as customers.',
      'Enter your real name so MRWD staff can identify your complaint records correctly.',
    ],
  }),
  exact('/forgot-password', {
    title: 'Password help',
    summary: 'Request a secure password-reset link for an existing MRWD account.',
    tips: [
      'Enter the same email address used for your MRWD account.',
      'Check your spam or junk folder if the reset email does not appear.',
      'For security, the page does not confirm whether an email address belongs to an account.',
    ],
  }),
  exact('/reset-password', {
    title: 'Set a new password',
    summary: 'Choose a new password after opening a valid MRWD password-reset link.',
    tips: [
      'Use a password that is difficult to guess and different from passwords you use elsewhere.',
      'Both password fields must match before the change can be saved.',
      'If the reset link has expired, request a new one from the password-help page.',
    ],
  }),
  exact('/mfa', {
    title: 'Verify your sign-in',
    summary: 'Enter the current six-digit code from your authenticator app to finish signing in.',
    tips: [
      'Authenticator codes change regularly, so use the newest code shown in your app.',
      'Make sure your phone date and time are set automatically if valid codes are being rejected.',
      'This extra verification protects System Administration access.',
    ],
  }),

  exact('/customer/my-complaints', {
    title: 'My complaints',
    summary: 'Review every complaint you submitted and quickly see its current status, priority, and latest progress.',
    tips: [
      'Select a complaint to open its full details and timeline.',
      'Use search and filters when you have several complaint records.',
      'Choose “Submit complaint” when you need to report a new water-service concern.',
    ],
  }),
  exact('/customer/submit', {
    title: 'Submit a complaint',
    summary: 'Report a water-service concern with enough detail for MRWD staff to review and locate the problem.',
    tips: [
      'Choose the complaint type that best matches the problem and describe what is happening in plain words.',
      `Give a clear service address or pin the location so ${TERMS.MAINTENANCE_PERSONNEL} can find it.`,
      'Attach a useful photo when it helps show the problem; avoid photos that contain unnecessary private information.',
      'Review the details before submitting because they become part of the complaint record.',
    ],
  }),
  exact('/customer/billing', {
    title: 'Billing',
    summary: 'View billing records connected to your MRWD customer account.',
    tips: [
      'Check the billing period, amount due, due date, and payment status for each bill.',
      'If no records appear, confirm that your MRWD account number is correct in My profile.',
      'Billing information shown here is for viewing; contact MRWD if a record appears incorrect.',
    ],
  }),
  exact('/customer/announcements', {
    title: TERMS.SERVICE_ADVISORIES,
    summary: 'Read customer-facing MRWD notices about service conditions and important updates.',
    tips: [
      'Important notices are highlighted so urgent service information is easier to spot.',
      'Check the notice date and active period before acting on older information.',
      'Service advisories provide general updates; submit a complaint when you need MRWD to handle a specific service problem.',
    ],
  }),

  exact('/commercial/dashboard', {
    title: 'Commercial overview',
    summary: 'See the current Commercial Services complaint workload and the items that need staff attention first.',
    tips: [
      'Use the Needs attention section to open work that is waiting for review or follow-up.',
      'Select a dashboard metric to open the related complaint list when available.',
      'The complaint-type chart helps show which customer concerns are appearing most often.',
    ],
  }),
  exact('/commercial/complaints', {
    title: 'Complaint review',
    summary: 'Review incoming customer complaints, confirm the information, and route field-related work to WDLCD under ECMD.',
    tips: [
      'Open a complaint before changing its workflow status so you can review its details and system suggestion.',
      'Use filters and saved views to focus on the complaints you handle most often.',
      'NSCCCD should send complaints to WDLCD only when field work is needed; Commercial Services can continue to monitor downstream progress.',
      'Bulk actions are useful when the same valid action applies to several selected complaints.',
    ],
  }),
  exact('/commercial/reports', {
    title: TERMS.COMPLAINT_ANALYTICS,
    summary: 'Review complaint demand, aging, outcomes, customer experience, and exceptions for Commercial Services decisions.',
    tips: [
      'Adjust the report filters before using the totals for a specific period or purpose.',
      'Use reports for trends and summaries; open Complaint review when you need to work on an individual complaint.',
      `Export data from ${TERMS.EXPORTS_SCHEDULES} when you need a file for offline reporting.`,
    ],
  }),
  exact('/commercial/export-center', {
    title: TERMS.EXPORTS_SCHEDULES,
    summary: 'Create complaint data exports and manage recurring Commercial Services report schedules.',
    tips: [
      'Check the selected date range and filters before generating an export.',
      'Scheduled reports run only while the schedule is active.',
      'Downloaded files may contain customer information, so store and share them only with authorized people.',
    ],
  }),
  exact('/commercial/accounts-billing', {
    title: TERMS.ACCOUNTS_BILLING,
    summary: 'Manage customer account registry information, billing records, and validated billing imports.',
    tips: [
      'Review file-validation issues before importing customer or billing data.',
      'Correct duplicate, missing, or invalid rows in the source file instead of forcing bad data into the system.',
      'Use customer account numbers consistently because they connect billing information to the correct customer profile.',
    ],
  }),
  exact('/commercial/service-advisories', {
    title: TERMS.SERVICE_ADVISORIES,
    summary: 'Create and manage customer-facing MRWD notices about service conditions and important updates.',
    tips: [
      'Write the title so customers can understand the issue without opening the full notice.',
      'Use Important only for information that genuinely needs extra attention.',
      'Set an active-until date when a notice should stop appearing after a known period.',
    ],
  }),

  exact('/ecmd/dashboard', {
    title: 'WDLCD overview',
    summary: 'See field work demand, dispatch status, and operational items that need WDLCD attention.',
    tips: [
      'Start with Needs attention to find forwarded complaints, work awaiting verification, and other pending actions.',
      'Use the workload information before assigning more work to Maintenance Personnel.',
      'Open Complaint dispatch when you need to assign or reassign field work.',
    ],
  }),
  exact('/ecmd/dispatch', {
    title: 'Complaint dispatch',
    summary: 'Assign forwarded complaints to available Maintenance Personnel and manage active field assignments.',
    tips: [
      'Review the complaint location, priority, and details before choosing Maintenance Personnel.',
      'Availability and workload are shown to help you avoid overloading one person.',
      'Use reassignment only when the current assignment needs to change and record a clear reason.',
      'Map view is useful when location should influence dispatch decisions.',
    ],
  }),
  exact('/ecmd/field-operations', {
    title: 'Field operations analytics',
    summary: 'Monitor queue aging, throughput, field capacity, recurring areas, incidents, and related operational records.',
    tips: [
      'Use incidents to group complaints that appear to come from the same larger service problem.',
      'Inventory adjustments should match real stock movement and include a clear reason.',
      'Maintenance note templates can save time while still allowing personnel to add task-specific details.',
    ],
  }),
  exact('/ecmd/crews', {
    title: 'Crew management',
    summary: 'Organize Maintenance Personnel into crews and manage crew membership and temporary substitutions.',
    tips: [
      'Keep crew membership current so dispatch and manpower records reflect the actual field team.',
      'Use substitutions for temporary replacements instead of permanently changing the crew when appropriate.',
      'Only active ECMD Maintenance Personnel can be used in crew assignments.',
    ],
  }),
  exact('/ecmd/availability', {
    title: 'Availability calendar',
    summary: 'Review and manage Maintenance Personnel schedules and availability for field work planning.',
    tips: [
      'Check this page before dispatching work that depends on a specific person or date.',
      'Use availability status to reflect whether personnel can reasonably receive new assignments.',
      'Schedule information supports planning; the actual complaint assignment is managed in Complaint dispatch.',
    ],
  }),

  exact('/system/dashboard', {
    title: 'System governance analytics',
    summary: 'Monitor staffing coverage, approval workload, notification delivery, archives, and system-level items that need attention.',
    tips: [
      'Use this page for administration and oversight rather than Commercial or ECMD operational work.',
      'Open Staff accounts for account access changes and Activity & security log for traceable system actions.',
      'System Supervisor actions that require stronger protection remain subject to MFA.',
    ],
  }),
  exact('/system/departments-access', {
    title: 'Departments & access',
    summary: 'Review department definitions and the access structure used to separate MRWD staff workspaces.',
    tips: [
      'Commercial Services and ECMD are separate operational workspaces even though they use the same application.',
      'System Supervisors should remain outside an operational department assignment.',
      'Use Staff accounts to assign a specific staff member to a department or position.',
    ],
  }),
  exact('/system/staff-accounts', {
    title: 'Staff accounts',
    summary: 'Manage staff account status, department assignment, staff position, and workspace access.',
    tips: [
      'Choose the account type and department carefully because they determine which workspace the person can access.',
      `${TERMS.COMMERCIAL_STAFF} belong to NSCCCD; ${TERMS.ECMD_STAFF} and ${TERMS.MAINTENANCE_PERSONNEL} belong to WDLCD under ECMD.`,
      'Reassign active maintenance work before deactivating Maintenance Personnel when required.',
      'New staff should replace their temporary password at first sign-in.',
    ],
  }),
  exact('/system/audit-log', {
    title: 'Activity & security log',
    summary: 'Review recorded administrative actions and security events for accountability and troubleshooting.',
    tips: [
      'Use filters to narrow the log by action, actor, record, or time period.',
      'Audit records are evidence of what happened; avoid treating them as editable operational data.',
      'Use the details field when you need context for a specific recorded action.',
    ],
  }),
  exact('/system/announcements', {
    title: 'Staff announcements',
    summary: 'Create internal announcements for MRWD staff workspaces.',
    tips: [
      'Choose the audience that actually needs the message instead of sending every notice to all staff.',
      'Keep internal announcements focused on work information and operational guidance.',
      `Customer-facing service notices belong in Commercial Services → ${TERMS.SERVICE_ADVISORIES}.`,
    ],
  }),
  exact('/system/health', {
    title: 'System health',
    summary: 'Check deployment configuration, scheduled-report readiness, and recorded backup-verification status.',
    tips: [
      'Resolve failed configuration checks before relying on the affected production feature.',
      'Server-only secrets must be configured in the deployment platform and must never be exposed as VITE variables.',
      'Backup verification records show that a check was performed; they do not replace the backup service itself.',
    ],
  }),

  exact('/maintenance/tasks', {
    title: 'My tasks',
    summary: 'View field work assigned to you, update task progress, and record the work completed on each complaint.',
    tips: [
      'Open the assigned complaint before travelling so you can review the address, problem details, and customer photo.',
      'Keep the task status current so ECMD can see whether work is assigned, en route, in progress, blocked, or complete.',
      'Record useful completion notes, manpower, and materials so ECMD has enough information to verify the work.',
      'Mark field work complete only when the work is ready for WDLCD verification.',
    ],
  }),
  exact('/maintenance/announcements', {
    title: 'Announcements',
    summary: 'Read internal MRWD notices that apply to Maintenance Personnel and field operations.',
    tips: [
      'Check important notices before starting field work for the day.',
      'Announcements provide general guidance; task-specific instructions remain inside the assigned complaint or maintenance task.',
    ],
  }),

  exact('/notifications', {
    title: 'Notifications',
    summary: 'Review system messages about complaints, assignments, approvals, and other activity that needs your attention.',
    tips: [
      'Open a notification to go to the related record when a link is available.',
      'Unread notifications are highlighted so new activity is easier to identify.',
      'Notifications are reminders; the related complaint or task remains the source of the full record.',
    ],
  }),
  exact('/profile', {
    title: 'My profile',
    summary: 'Review and update the account information you are allowed to manage yourself.',
    tips: [
      'Customers can keep contact and service-account information current here.',
      'Maintenance Personnel can update their own availability details when available on the page.',
      'System Supervisors can manage MFA and other security options from the security section.',
      'Department, staff position, and staff access changes are controlled by System Administration.',
    ],
  }),
  prefix('/complaints/', {
    title: 'Complaint details',
    summary: 'See the complete complaint record, current workflow step, timeline, and the actions available to your account.',
    tips: [
      'The progress indicator shows where the complaint is in the MRWD workflow.',
      'Use the timeline to understand who changed the complaint and when important events happened.',
      'Available actions differ by role so customers, Commercial Services, ECMD, and Maintenance Personnel see only appropriate controls.',
    ],
  }),
  prefix('/maintenance-reports/', {
    title: 'Maintenance report',
    summary: 'Review the field work record for a maintenance task, including progress notes, manpower, and materials used.',
    tips: [
      'Use the task and complaint references to confirm you are reviewing the correct job.',
      'Field work notes should describe what was done clearly enough for WDLCD verification and later reporting.',
      'Manpower and material records support operational reporting and should match the actual work performed.',
    ],
  }),
]

export const PUBLIC_PAGE_HELP_PATHS = new Set([
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/mfa',
])

export function getPageHelp(pathname = '') {
  return PAGE_HELP.find(item => item.match(pathname)) || null
}

export default PAGE_HELP
