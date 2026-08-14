import { Navigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { hasCapability, homeForUser } from '../lib/accessControl'

export default function ProtectedRoute({ children, allowedRoles, requiredCapabilities, capabilityRestrictedRoles }) {
  const user = useAuthStore(s => s.user)

  if (!user) return <Navigate to="/login" replace />

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to={homeForUser(user)} replace />
  }

  const capabilityApplies = !capabilityRestrictedRoles?.length || capabilityRestrictedRoles.includes(user.role)
  if (capabilityApplies && requiredCapabilities?.length && !hasCapability(user, ...requiredCapabilities)) {
    return <Navigate to={homeForUser(user)} replace />
  }

  return children
}
