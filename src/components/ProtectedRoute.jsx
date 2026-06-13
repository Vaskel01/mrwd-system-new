import { Navigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'

const ROLE_HOME = {
  customer:    '/customer/submit',
  admin:       '/admin/dashboard',
  maintenance_personnel: '/maintenance/tasks',
}

export default function ProtectedRoute({ children, allowedRoles }) {
  const user = useAuthStore(s => s.user)

  if (!user) return <Navigate to="/login" replace />

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to={ROLE_HOME[user.role] || '/login'} replace />
  }

  return children
}
