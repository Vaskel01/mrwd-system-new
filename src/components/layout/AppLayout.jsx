import { NavLink, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'

const NAV = {
  customer: [
    { to: '/customer/submit',       icon: '📝', label: 'Submit Complaint' },
    { to: '/customer/my-complaints', icon: '📋', label: 'My Complaints' },
  ],
  admin: [
    { to: '/admin/dashboard',  icon: '📊', label: 'Dashboard' },
    { to: '/admin/complaints', icon: '📋', label: 'All Complaints' },
    { to: '/admin/assign',     icon: '👷', label: 'Assign Tasks' },
  ],
  maintenance: [
    { to: '/maintenance/tasks', icon: '🔧', label: 'My Tasks' },
  ],
}

const ROLE_LABEL = {
  customer:    'Customer Portal',
  admin:       'Admin Panel',
  maintenance: 'Maintenance Portal',
}

export default function AppLayout({ children }) {
  const user     = useAuthStore(s => s.user)
  const signOut  = useAuthStore(s => s.signOut)
  const navigate = useNavigate()
  const navItems = NAV[user?.role] || []

  const handleSignOut = () => {
    signOut()
    navigate('/login', { replace: true })
  }

  return (
    <div className="min-h-screen flex bg-gray-50">

      {/* Sidebar */}
      <aside className="w-60 bg-brand-900 flex flex-col shrink-0 fixed h-full">

        {/* Logo */}
        <div className="px-5 py-5 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-brand-500 rounded-xl flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round"
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
              </svg>
            </div>
            <div>
              <p className="text-white text-sm font-bold leading-tight">CMS</p>
              <p className="text-blue-300 text-xs">{ROLE_LABEL[user?.role]}</p>
            </div>
          </div>
        </div>

        {/* Nav links */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {navItems.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors
                ${isActive
                  ? 'bg-brand-600 text-white'
                  : 'text-blue-200 hover:bg-white/10 hover:text-white'
                }`
              }
            >
              <span>{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* User + sign out */}
        <div className="px-3 py-4 border-t border-white/10">
          <div className="flex items-center gap-2.5 px-3 py-2 mb-1">
            <div className="w-8 h-8 bg-brand-600 rounded-full flex items-center justify-center shrink-0">
              <span className="text-white text-xs font-bold uppercase">
                {user?.full_name?.[0] || '?'}
              </span>
            </div>
            <div className="min-w-0">
              <p className="text-white text-xs font-semibold truncate">{user?.full_name}</p>
              <p className="text-blue-300 text-xs capitalize">{user?.role}</p>
            </div>
          </div>
          <button
            onClick={handleSignOut}
            className="w-full flex items-center gap-2 px-3 py-2 text-blue-300 hover:text-white hover:bg-white/10 rounded-lg text-sm transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/>
            </svg>
            Sign out
          </button>
        </div>
      </aside>

      {/* Page content */}
      <main className="flex-1 ml-60 overflow-auto min-h-screen">
        <div className="max-w-5xl mx-auto px-6 py-8">
          {children}
        </div>
      </main>

    </div>
  )
}
