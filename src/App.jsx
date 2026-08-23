import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute'
import AppLayout from './components/layout/AppLayout'
import { PageLoader } from './components/ui/Feedback'
import { CAPABILITIES } from './lib/accessControl'
import PageHelpTooltip from './components/ui/PageHelpTooltip'
import { getPageHelp, PUBLIC_PAGE_HELP_PATHS } from './config/pageHelp'

const LoginPage = lazy(() => import('./pages/auth/LoginPage'))
const RegisterPage = lazy(() => import('./pages/auth/RegisterPage'))
const ForgotPasswordPage = lazy(() => import('./pages/auth/ForgotPasswordPage'))
const ResetPasswordPage = lazy(() => import('./pages/auth/ResetPasswordPage'))
const MfaChallengePage = lazy(() => import('./pages/auth/MfaChallengePage'))

const SubmitComplaintPage = lazy(() => import('./pages/customer/SubmitComplaintPage'))
const MyComplaintsPage = lazy(() => import('./pages/customer/MyComplaintsPage'))
const BillingPage = lazy(() => import('./pages/customer/BillingPage'))

const CommercialDashboardPage = lazy(() => import('./pages/commercial/CommercialDashboardPage'))
const CommercialComplaintReviewPage = lazy(() => import('./pages/commercial/CommercialComplaintReviewPage'))
const CommercialReportsPage = lazy(() => import('./pages/commercial/CommercialReportsPage'))
const CommercialAccountsBillingPage = lazy(() => import('./pages/commercial/CommercialAccountsBillingPage'))
const CommercialAdvisoriesPage = lazy(() => import('./pages/commercial/CommercialAdvisoriesPage'))
const CommercialExportCenterPage = lazy(() => import('./pages/commercial/CommercialExportCenterPage'))

const EcmdDashboardPage = lazy(() => import('./pages/ecmd/EcmdDashboardPage'))
const EcmdDispatchPage = lazy(() => import('./pages/ecmd/EcmdDispatchPage'))
const EcmdFieldOperationsPage = lazy(() => import('./pages/ecmd/EcmdFieldOperationsPage'))
const EcmdCrewManagementPage = lazy(() => import('./pages/ecmd/EcmdCrewManagementPage'))
const EcmdAvailabilityCalendarPage = lazy(() => import('./pages/ecmd/EcmdAvailabilityCalendarPage'))

const SystemDashboardPage = lazy(() => import('./pages/system/SystemDashboardPage'))
const SystemDepartmentsPage = lazy(() => import('./pages/system/SystemDepartmentsPage'))
const SystemStaffAccountsPage = lazy(() => import('./pages/system/SystemStaffAccountsPage'))
const SystemAuditLogPage = lazy(() => import('./pages/system/SystemAuditLogPage'))
const SystemAnnouncementsPage = lazy(() => import('./pages/system/SystemAnnouncementsPage'))
const SystemHealthPage = lazy(() => import('./pages/system/SystemHealthPage'))

const MaintenanceTasksPage = lazy(() => import('./pages/maintenance/MaintenanceTasksPage'))
const AnnouncementsPage = lazy(() => import('./pages/shared/AnnouncementsPage'))
const ComplaintDetailsPage = lazy(() => import('./pages/shared/ComplaintDetailsPage'))
const NotificationsPage = lazy(() => import('./pages/shared/NotificationsPage'))
const ProfilePage = lazy(() => import('./pages/shared/ProfilePage'))
const MaintenanceReportPage = lazy(() => import('./pages/shared/MaintenanceReportPage'))


function PublicPageHelp() {
  const location = useLocation()
  if (!PUBLIC_PAGE_HELP_PATHS.has(location.pathname)) return null
  const help = getPageHelp(location.pathname)
  return (
    <div className="fixed right-3 top-3 z-50 sm:right-5 sm:top-5">
      <PageHelpTooltip help={help} floating />
    </div>
  )
}

function AppPage({ children }) {
  return <AppLayout>{children}</AppLayout>
}

export default function App() {
  return (
    <BrowserRouter>
      <PublicPageHelp />
      <Suspense fallback={<PageLoader label="Loading page…" />}>
        <Routes>
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/mfa" element={<MfaChallengePage />} />

          <Route path="/complaints/:id" element={
            <ProtectedRoute allowedRoles={['customer', 'admin', 'maintenance_personnel']}>
              <AppPage><ComplaintDetailsPage /></AppPage>
            </ProtectedRoute>
          } />
          <Route path="/notifications" element={
            <ProtectedRoute allowedRoles={['customer', 'admin', 'maintenance_personnel']}>
              <AppPage><NotificationsPage /></AppPage>
            </ProtectedRoute>
          } />
          <Route path="/profile" element={
            <ProtectedRoute allowedRoles={['customer', 'admin', 'maintenance_personnel']}>
              <AppPage><ProfilePage /></AppPage>
            </ProtectedRoute>
          } />
          <Route path="/maintenance-reports/:id" element={
            <ProtectedRoute allowedRoles={['admin', 'maintenance_personnel']} requiredCapabilities={[CAPABILITIES.ECMD_REPORTS]} capabilityRestrictedRoles={['admin']}>
              <AppPage><MaintenanceReportPage /></AppPage>
            </ProtectedRoute>
          } />

          <Route path="/customer/submit" element={
            <ProtectedRoute allowedRoles={['customer']}>
              <AppPage><SubmitComplaintPage /></AppPage>
            </ProtectedRoute>
          } />
          <Route path="/customer/my-complaints" element={
            <ProtectedRoute allowedRoles={['customer']}>
              <AppPage><MyComplaintsPage /></AppPage>
            </ProtectedRoute>
          } />
          <Route path="/customer/billing" element={
            <ProtectedRoute allowedRoles={['customer']}>
              <AppPage><BillingPage /></AppPage>
            </ProtectedRoute>
          } />
          <Route path="/customer/announcements" element={
            <ProtectedRoute allowedRoles={['customer']}>
              <AppPage><AnnouncementsPage /></AppPage>
            </ProtectedRoute>
          } />

          <Route path="/commercial/dashboard" element={
            <ProtectedRoute allowedRoles={['admin']} requiredCapabilities={[CAPABILITIES.COMMERCIAL_COMPLAINTS]}>
              <AppPage><CommercialDashboardPage /></AppPage>
            </ProtectedRoute>
          } />
          <Route path="/commercial/complaints" element={
            <ProtectedRoute allowedRoles={['admin']} requiredCapabilities={[CAPABILITIES.COMMERCIAL_COMPLAINTS]}>
              <AppPage><CommercialComplaintReviewPage /></AppPage>
            </ProtectedRoute>
          } />
          <Route path="/commercial/reports" element={
            <ProtectedRoute allowedRoles={['admin']} requiredCapabilities={[CAPABILITIES.COMMERCIAL_REPORTS]}>
              <AppPage><CommercialReportsPage /></AppPage>
            </ProtectedRoute>
          } />
          <Route path="/commercial/accounts-billing" element={
            <ProtectedRoute allowedRoles={['admin']} requiredCapabilities={[CAPABILITIES.COMMERCIAL_BILLING]}>
              <AppPage><CommercialAccountsBillingPage /></AppPage>
            </ProtectedRoute>
          } />
          <Route path="/commercial/service-advisories" element={
            <ProtectedRoute allowedRoles={['admin']} requiredCapabilities={[CAPABILITIES.COMMERCIAL_ANNOUNCEMENTS]}>
              <AppPage><CommercialAdvisoriesPage /></AppPage>
            </ProtectedRoute>
          } />
          <Route path="/commercial/export-center" element={
            <ProtectedRoute allowedRoles={['admin']} requiredCapabilities={[CAPABILITIES.COMMERCIAL_REPORTS]}>
              <AppPage><CommercialExportCenterPage /></AppPage>
            </ProtectedRoute>
          } />

          <Route path="/ecmd/dashboard" element={
            <ProtectedRoute allowedRoles={['admin']} requiredCapabilities={[CAPABILITIES.ECMD_DISPATCH]}>
              <AppPage><EcmdDashboardPage /></AppPage>
            </ProtectedRoute>
          } />
          <Route path="/ecmd/dispatch" element={
            <ProtectedRoute allowedRoles={['admin']} requiredCapabilities={[CAPABILITIES.ECMD_DISPATCH]}>
              <AppPage><EcmdDispatchPage /></AppPage>
            </ProtectedRoute>
          } />
          <Route path="/ecmd/field-operations" element={
            <ProtectedRoute allowedRoles={['admin']} requiredCapabilities={[CAPABILITIES.ECMD_OPERATIONS]}>
              <AppPage><EcmdFieldOperationsPage /></AppPage>
            </ProtectedRoute>
          } />
          <Route path="/ecmd/crews" element={
            <ProtectedRoute allowedRoles={['admin']} requiredCapabilities={[CAPABILITIES.ECMD_OPERATIONS]}>
              <AppPage><EcmdCrewManagementPage /></AppPage>
            </ProtectedRoute>
          } />
          <Route path="/ecmd/availability" element={
            <ProtectedRoute allowedRoles={['admin']} requiredCapabilities={[CAPABILITIES.ECMD_OPERATIONS]}>
              <AppPage><EcmdAvailabilityCalendarPage /></AppPage>
            </ProtectedRoute>
          } />

          <Route path="/system/dashboard" element={
            <ProtectedRoute allowedRoles={['admin']} requiredCapabilities={[CAPABILITIES.SUPERVISOR_DASHBOARD]}>
              <AppPage><SystemDashboardPage /></AppPage>
            </ProtectedRoute>
          } />
          <Route path="/system/departments-access" element={
            <ProtectedRoute allowedRoles={['admin']} requiredCapabilities={[CAPABILITIES.SYSTEM_DEPARTMENTS]}>
              <AppPage><SystemDepartmentsPage /></AppPage>
            </ProtectedRoute>
          } />
          <Route path="/system/staff-accounts" element={
            <ProtectedRoute allowedRoles={['admin']} requiredCapabilities={[CAPABILITIES.SYSTEM_STAFF]}>
              <AppPage><SystemStaffAccountsPage /></AppPage>
            </ProtectedRoute>
          } />
          <Route path="/system/audit-log" element={
            <ProtectedRoute allowedRoles={['admin']} requiredCapabilities={[CAPABILITIES.SYSTEM_AUDIT]}>
              <AppPage><SystemAuditLogPage /></AppPage>
            </ProtectedRoute>
          } />
          <Route path="/system/announcements" element={
            <ProtectedRoute allowedRoles={['admin']} requiredCapabilities={[CAPABILITIES.SUPERVISOR_DASHBOARD]}>
              <AppPage><SystemAnnouncementsPage /></AppPage>
            </ProtectedRoute>
          } />
          <Route path="/system/health" element={
            <ProtectedRoute allowedRoles={['admin']} requiredCapabilities={[CAPABILITIES.SUPERVISOR_DASHBOARD]}>
              <AppPage><SystemHealthPage /></AppPage>
            </ProtectedRoute>
          } />

          <Route path="/admin/dashboard" element={<Navigate to="/system/dashboard" replace />} />
          <Route path="/admin/complaints" element={<Navigate to="/commercial/complaints" replace />} />
          <Route path="/admin/reports" element={<Navigate to="/commercial/reports" replace />} />
          <Route path="/admin/commercial-operations" element={<Navigate to="/commercial/accounts-billing" replace />} />
          <Route path="/admin/announcements" element={<Navigate to="/commercial/service-advisories" replace />} />
          <Route path="/admin/assign" element={<Navigate to="/ecmd/dispatch" replace />} />
          <Route path="/admin/ecmd-operations" element={<Navigate to="/ecmd/field-operations" replace />} />
          <Route path="/admin/system-operations" element={<Navigate to="/system/departments-access" replace />} />
          <Route path="/admin/operations" element={<Navigate to="/system/departments-access" replace />} />
          <Route path="/admin/staff" element={<Navigate to="/system/staff-accounts" replace />} />
          <Route path="/admin/audit" element={<Navigate to="/system/audit-log" replace />} />

          <Route path="/maintenance/tasks" element={
            <ProtectedRoute allowedRoles={['maintenance_personnel']}>
              <AppPage><MaintenanceTasksPage /></AppPage>
            </ProtectedRoute>
          } />
          <Route path="/maintenance/announcements" element={
            <ProtectedRoute allowedRoles={['maintenance_personnel']}>
              <AppPage><AnnouncementsPage /></AppPage>
            </ProtectedRoute>
          } />

          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
