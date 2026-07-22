import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute'
import AppLayout from './components/layout/AppLayout'

// Auth
import LoginPage from './pages/auth/LoginPage'
import RegisterPage from './pages/auth/RegisterPage'

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

// Maintenance
import MaintenanceTasksPage from './pages/maintenance/MaintenanceTasksPage'

// Shared
import AnnouncementsPage from './pages/shared/AnnouncementsPage'
import ComplaintDetailsPage from './pages/shared/ComplaintDetailsPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>

        {/* ── Public ── */}
        <Route path="/"         element={<Navigate to="/login" replace />} />
        <Route path="/login"    element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />

        {/* ── Shared complaint details ── */}
        <Route path="/complaints/:id" element={
          <ProtectedRoute allowedRoles={['customer', 'admin', 'maintenance_personnel']}>
            <AppLayout><ComplaintDetailsPage /></AppLayout>
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
          <ProtectedRoute allowedRoles={['admin']}>
            <AppLayout><AdminDashboard /></AppLayout>
          </ProtectedRoute>
        }/>
        <Route path="/admin/complaints" element={
          <ProtectedRoute allowedRoles={['admin']}>
            <AppLayout><AllComplaintsPage /></AppLayout>
          </ProtectedRoute>
        }/>
        <Route path="/admin/assign" element={
          <ProtectedRoute allowedRoles={['admin']}>
            <AppLayout><AssignTaskPage /></AppLayout>
          </ProtectedRoute>
        }/>
        <Route path="/admin/announcements" element={
          <ProtectedRoute allowedRoles={['admin']}>
            <AppLayout><AdminAnnouncementsPage /></AppLayout>
          </ProtectedRoute>
        }/>
        <Route path="/admin/staff" element={
          <ProtectedRoute allowedRoles={['admin']}>
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
