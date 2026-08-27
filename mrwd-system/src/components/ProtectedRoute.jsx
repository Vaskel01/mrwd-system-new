import { Navigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { hasCapability, homeForUser } from '../lib/accessControl'

export default function ProtectedRoute({ children, allowedRoles, requiredCapabilities, capabilityRestrictedRoles }) {
  const location = useLocation()
  const user = useAuthStore(s => s.user)
  const mfaPending = useAuthStore(s => s.mfaPending)
  const mfaEnrollmentRequired = useAuthStore(s => s.mfaEnrollmentRequired)

  if (!user) return <Navigate to="/login" replace />
  const onProfile = location.pathname === '/profile'
  if (user.must_change_password && !onProfile) return <Navigate to="/profile?change-password=1" replace />
  if (mfaPending && location.pathname !== '/mfa') return <Navigate to="/mfa" replace />
  if (mfaEnrollmentRequired && !onProfile) return <Navigate to="/profile?setup-mfa=1" replace />

  if (allowedRoles && !allowedRoles.includes(user.role)) return <Navigate to={homeForUser(user)} replace />
  const capabilityApplies = !capabilityRestrictedRoles?.length || capabilityRestrictedRoles.includes(user.role)
  if (capabilityApplies && requiredCapabilities?.length && !hasCapability(user, ...requiredCapabilities)) return <Navigate to={homeForUser(user)} replace />
  return children
}
