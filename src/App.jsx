import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute'
import AppLayout from './components/layout/AppLayout'

import LoginPage from './pages/auth/LoginPage'
import SubmitComplaintPage from './pages/customer/SubmitComplaintPage'
import MyComplaintsPage from './pages/customer/MyComplaintsPage'
import AdminDashboard from './pages/admin/AdminDashboard'
import AllComplaintsPage from './pages/admin/AllComplaintsPage'
import AssignTaskPage from './pages/admin/AssignTaskPage'
import MaintenanceTasksPage from './pages/maintenance/MaintenanceTasksPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />

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
        <Route path="/maintenance/tasks" element={
          <ProtectedRoute allowedRoles={['maintenance']}>
            <AppLayout><MaintenanceTasksPage /></AppLayout>
          </ProtectedRoute>
        }/>

        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
