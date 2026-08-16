import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute'
import AppLayout from './components/layout/AppLayout'

// Auth
import LoginPage from './pages/auth/LoginPage'
import RegisterPage from './pages/auth/RegisterPage'
import ForgotPasswordPage from './pages/auth/ForgotPasswordPage'
import ResetPasswordPage from './pages/auth/ResetPasswordPage'

// Customer
import SubmitComplaintPage from './pages/customer/SubmitComplaintPage'
import MyComplaintsPage from './pages/customer/MyComplaintsPage'
import BillingPage from './pages/customer/BillingPage'

// Department-specific staff pages
import CommercialDashboardPage from './pages/commercial/CommercialDashboardPage'
import CommercialComplaintReviewPage from './pages/commercial/CommercialComplaintReviewPage'
import CommercialReportsPage from './pages/commercial/CommercialReportsPage'
import CommercialAccountsBillingPage from './pages/commercial/CommercialAccountsBillingPage'
import CommercialAdvisoriesPage from './pages/commercial/CommercialAdvisoriesPage'
import EcmdDashboardPage from './pages/ecmd/EcmdDashboardPage'
import EcmdDispatchPage from './pages/ecmd/EcmdDispatchPage'
import EcmdFieldOperationsPage from './pages/ecmd/EcmdFieldOperationsPage'
import SystemDashboardPage from './pages/system/SystemDashboardPage'
import SystemDepartmentsPage from './pages/system/SystemDepartmentsPage'
import SystemStaffAccountsPage from './pages/system/SystemStaffAccountsPage'
import SystemAuditLogPage from './pages/system/SystemAuditLogPage'

// Maintenance
import MaintenanceTasksPage from './pages/maintenance/MaintenanceTasksPage'

// Shared
import AnnouncementsPage from './pages/shared/AnnouncementsPage'
import ComplaintDetailsPage from './pages/shared/ComplaintDetailsPage'
import NotificationsPage from './pages/shared/NotificationsPage'
import ProfilePage from './pages/shared/ProfilePage'
import MaintenanceReportPage from './pages/shared/MaintenanceReportPage'
import { CAPABILITIES } from './lib/accessControl'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>

        {/* ── Public ── */}
        <Route path="/"         element={<Navigate to="/login" replace />} />
        <Route path="/login"    element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />

        {/* ── Shared complaint details ── */}
        <Route path="/complaints/:id" element={
          <ProtectedRoute allowedRoles={['customer', 'admin', 'maintenance_personnel']}>
            <AppLayout><ComplaintDetailsPage /></AppLayout>
          </ProtectedRoute>
        }/>


        <Route path="/notifications" element={
          <ProtectedRoute allowedRoles={['customer', 'admin', 'maintenance_personnel']}>
            <AppLayout><NotificationsPage /></AppLayout>
          </ProtectedRoute>
        }/>
        <Route path="/profile" element={
          <ProtectedRoute allowedRoles={['customer', 'admin', 'maintenance_personnel']}>
            <AppLayout><ProfilePage /></AppLayout>
          </ProtectedRoute>
        }/>
        <Route path="/maintenance-reports/:id" element={
          <ProtectedRoute allowedRoles={['admin', 'maintenance_personnel']} requiredCapabilities={[CAPABILITIES.ECMD_REPORTS]} capabilityRestrictedRoles={['admin']}>
            <AppLayout><MaintenanceReportPage /></AppLayout>
          </ProtectedRoute>
        }/>

        {/* ── Customer ── */}
        <Route path="/customer/submit" element={
          <ProtectedRoute allowedRoles={['customer']}>
            <AppLayout><SubmitComplaintPage /></AppLayout>
          </ProtectedRoute>
        }/>
        <Route path="/customer/my-complaints" element={
          <ProtectedRoute allowedRoles={['customer']}>
            <AppLayout><MyComplaintsPage /></AppLayout>
          </ProtectedRoute>
        }/>
        <Route path="/customer/billing" element={
          <ProtectedRoute allowedRoles={['customer']}>
            <AppLayout><BillingPage /></AppLayout>
          </ProtectedRoute>
        }/>
        <Route path="/customer/announcements" element={
          <ProtectedRoute allowedRoles={['customer']}>
            <AppLayout><AnnouncementsPage /></AppLayout>
          </ProtectedRoute>
        }/>

        {/* ── Commercial Services Department ── */}
        <Route path="/commercial/dashboard" element={
          <ProtectedRoute allowedRoles={['admin']} requiredCapabilities={[CAPABILITIES.COMMERCIAL_COMPLAINTS]}>
            <AppLayout><CommercialDashboardPage /></AppLayout>
          </ProtectedRoute>
        }/>
        <Route path="/commercial/complaints" element={
          <ProtectedRoute allowedRoles={['admin']} requiredCapabilities={[CAPABILITIES.COMMERCIAL_COMPLAINTS]}>
            <AppLayout><CommercialComplaintReviewPage /></AppLayout>
          </ProtectedRoute>
        }/>
        <Route path="/commercial/reports" element={
          <ProtectedRoute allowedRoles={['admin']} requiredCapabilities={[CAPABILITIES.COMMERCIAL_REPORTS]}>
            <AppLayout><CommercialReportsPage /></AppLayout>
          </ProtectedRoute>
        }/>
        <Route path="/commercial/accounts-billing" element={
          <ProtectedRoute allowedRoles={['admin']} requiredCapabilities={[CAPABILITIES.COMMERCIAL_BILLING]}>
            <AppLayout><CommercialAccountsBillingPage /></AppLayout>
          </ProtectedRoute>
        }/>
        <Route path="/commercial/service-advisories" element={
          <ProtectedRoute allowedRoles={['admin']} requiredCapabilities={[CAPABILITIES.COMMERCIAL_ANNOUNCEMENTS]}>
            <AppLayout><CommercialAdvisoriesPage /></AppLayout>
          </ProtectedRoute>
        }/>

        {/* ── Engineering, Construction and Maintenance Department (ECMD) ── */}
        <Route path="/ecmd/dashboard" element={
          <ProtectedRoute allowedRoles={['admin']} requiredCapabilities={[CAPABILITIES.ECMD_DISPATCH]}>
            <AppLayout><EcmdDashboardPage /></AppLayout>
          </ProtectedRoute>
        }/>
        <Route path="/ecmd/dispatch" element={
          <ProtectedRoute allowedRoles={['admin']} requiredCapabilities={[CAPABILITIES.ECMD_DISPATCH]}>
            <AppLayout><EcmdDispatchPage /></AppLayout>
          </ProtectedRoute>
        }/>
        <Route path="/ecmd/field-operations" element={
          <ProtectedRoute allowedRoles={['admin']} requiredCapabilities={[CAPABILITIES.ECMD_OPERATIONS]}>
            <AppLayout><EcmdFieldOperationsPage /></AppLayout>
          </ProtectedRoute>
        }/>

        {/* ── System Administration ── */}
        <Route path="/system/dashboard" element={
          <ProtectedRoute allowedRoles={['admin']} requiredCapabilities={[CAPABILITIES.SUPERVISOR_DASHBOARD]}>
            <AppLayout><SystemDashboardPage /></AppLayout>
          </ProtectedRoute>
        }/>
        <Route path="/system/departments-access" element={
          <ProtectedRoute allowedRoles={['admin']} requiredCapabilities={[CAPABILITIES.SYSTEM_DEPARTMENTS]}>
            <AppLayout><SystemDepartmentsPage /></AppLayout>
          </ProtectedRoute>
        }/>
        <Route path="/system/staff-accounts" element={
          <ProtectedRoute allowedRoles={['admin']} requiredCapabilities={[CAPABILITIES.SYSTEM_STAFF]}>
            <AppLayout><SystemStaffAccountsPage /></AppLayout>
          </ProtectedRoute>
        }/>
        <Route path="/system/audit-log" element={
          <ProtectedRoute allowedRoles={['admin']} requiredCapabilities={[CAPABILITIES.SYSTEM_AUDIT]}>
            <AppLayout><SystemAuditLogPage /></AppLayout>
          </ProtectedRoute>
        }/>

        {/* Compatibility redirects for links saved before department separation. */}
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

        {/* ── Maintenance ── */}
        <Route path="/maintenance/tasks" element={
          <ProtectedRoute allowedRoles={['maintenance_personnel']}>
            <AppLayout><MaintenanceTasksPage /></AppLayout>
          </ProtectedRoute>
        }/>
        <Route path="/maintenance/announcements" element={
          <ProtectedRoute allowedRoles={['maintenance_personnel']}>
            <AppLayout><AnnouncementsPage /></AppLayout>
          </ProtectedRoute>
        }/>

        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
