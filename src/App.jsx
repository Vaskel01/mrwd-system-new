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

// Admin
import AdminDashboard from './pages/admin/AdminDashboard'
import AllComplaintsPage from './pages/admin/AllComplaintsPage'
import AssignTaskPage from './pages/admin/AssignTaskPage'
import AdminAnnouncementsPage from './pages/admin/AdminAnnouncementsPage'
import StaffAccountsPage from './pages/admin/StaffAccountsPage'
import ReportsPage from './pages/admin/ReportsPage'
import AuditLogPage from './pages/admin/AuditLogPage'
import OperationsPage from './pages/admin/OperationsPage'

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

        {/* ── Admin ── */}
        <Route path="/admin/dashboard" element={
          <ProtectedRoute allowedRoles={['admin']} requiredCapabilities={[CAPABILITIES.SUPERVISOR_DASHBOARD]}>
            <AppLayout><AdminDashboard /></AppLayout>
          </ProtectedRoute>
        }/>
        <Route path="/admin/complaints" element={
          <ProtectedRoute allowedRoles={['admin']} requiredCapabilities={[CAPABILITIES.COMMERCIAL_COMPLAINTS]}>
            <AppLayout><AllComplaintsPage /></AppLayout>
          </ProtectedRoute>
        }/>
        <Route path="/admin/assign" element={
          <ProtectedRoute allowedRoles={['admin']} requiredCapabilities={[CAPABILITIES.ECMD_DISPATCH]}>
            <AppLayout><AssignTaskPage /></AppLayout>
          </ProtectedRoute>
        }/>

        <Route path="/admin/reports" element={
          <ProtectedRoute allowedRoles={['admin']} requiredCapabilities={[CAPABILITIES.COMMERCIAL_REPORTS]}>
            <AppLayout><ReportsPage /></AppLayout>
          </ProtectedRoute>
        }/>
        <Route path="/admin/audit" element={
          <ProtectedRoute allowedRoles={['admin']} requiredCapabilities={[CAPABILITIES.SYSTEM_AUDIT]}>
            <AppLayout><AuditLogPage /></AppLayout>
          </ProtectedRoute>
        }/>
        <Route path="/admin/commercial-operations" element={
          <ProtectedRoute allowedRoles={['admin']} requiredCapabilities={[CAPABILITIES.COMMERCIAL_BILLING]}>
            <AppLayout><OperationsPage module="commercial" /></AppLayout>
          </ProtectedRoute>
        }/>
        <Route path="/admin/ecmd-operations" element={
          <ProtectedRoute allowedRoles={['admin']} requiredCapabilities={[CAPABILITIES.ECMD_OPERATIONS]}>
            <AppLayout><OperationsPage module="ecmd" /></AppLayout>
          </ProtectedRoute>
        }/>
        <Route path="/admin/system-operations" element={
          <ProtectedRoute allowedRoles={['admin']} requiredCapabilities={[CAPABILITIES.SYSTEM_DEPARTMENTS]}>
            <AppLayout><OperationsPage module="system" /></AppLayout>
          </ProtectedRoute>
        }/>
        <Route path="/admin/operations" element={<Navigate to="/admin/system-operations" replace />} />

        <Route path="/admin/announcements" element={
          <ProtectedRoute allowedRoles={['admin']} requiredCapabilities={[CAPABILITIES.COMMERCIAL_ANNOUNCEMENTS]}>
            <AppLayout><AdminAnnouncementsPage /></AppLayout>
          </ProtectedRoute>
        }/>
        <Route path="/admin/staff" element={
          <ProtectedRoute allowedRoles={['admin']} requiredCapabilities={[CAPABILITIES.SYSTEM_STAFF]}>
            <AppLayout><StaffAccountsPage /></AppLayout>
          </ProtectedRoute>
        }/>

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
