import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'

const NAV = {
  customer: [
    { to: '/customer/submit',        icon: '📝', label: 'Submit Complaint' },
    { to: '/customer/my-complaints', icon: '📋', label: 'My Complaints' },
    { to: '/customer/billing',       icon: '💧', label: 'Billing Statement' },
    { to: '/customer/announcements', icon: '📢', label: 'Announcements' },
  ],
  admin: [
    { to: '/admin/dashboard',     icon: '📊', label: 'Dashboard' },
    { to: '/admin/complaints',    icon: '📋', label: 'All Complaints' },
    { to: '/admin/assign',        icon: '👷', label: 'Assign Tasks' },
    { to: '/admin/announcements', icon: '📢', label: 'Announcements' },
  ],
  maintenance: [
    { to: '/maintenance/tasks',         icon: '🔧', label: 'My Tasks' },
    { to: '/maintenance/announcements', icon: '📢', label: 'Announcements' },
  ],
}

const ROLE_META = {
  customer:    { label: 'Customer Portal',    color: 'bg-blue-500',   emoji: '👤' },
  admin:       { label: 'Admin Panel',        color: 'bg-indigo-500', emoji: '👨‍💼' },
  maintenance: { label: 'Maintenance Portal', color: 'bg-amber-500',  emoji: '🔧' },
}

function HamburgerIcon({ open }) {
  return (
    <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      {open
        ? <path strokeLinecap="square" strokeLinejoin="miter" d="M6 18L18 6M6 6l12 12"/>
        : <path strokeLinecap="square" strokeLinejoin="miter" d="M4 6h16M4 12h16M4 18h16"/>
      }
    </svg>
  )
}

export default function AppLayout({ children }) {
  const user     = useAuthStore(s => s.user)
  const signOut  = useAuthStore(s => s.signOut)
  const navigate = useNavigate()
  const role     = user?.role || 'customer'
  const meta     = ROLE_META[role]
  const navItems = NAV[role] || []
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const handleSignOut = () => {
    signOut()
    navigate('/', { replace: true })
  }

  const closeSidebar = () => setSidebarOpen(false)

  const SidebarContent = () => (
    <>
      {/* Logo */}
      <div className="px-5 py-5 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-brand-500 flex items-center justify-center shrink-0 shadow-lg shadow-brand-500/30">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 3c-4.97 5.06-7 8.36-7 11a7 7 0 0014 0c0-2.64-2.03-5.94-7-11z"/>
            </svg>
          </div>
          <div>
            <p className="font-display font-bold text-white text-sm leading-tight">Water District</p>
            <p className="text-blue-300 text-xs">{meta.label}</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {navItems.map(item => (
          <NavLink key={item.to} to={item.to}
            onClick={closeSidebar}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-3 text-sm font-medium transition-all duration-150
              ${isActive
                ? 'bg-brand-600 text-white'
                : 'text-blue-200 hover:bg-white/10 hover:text-white'
              }`
            }
          >
            <span className="text-base w-5 text-center">{item.icon}</span>
            {item.label}
          </NavLink>
        ))}
      </nav>

      {/* User section */}
      <div className="px-3 py-4 border-t border-white/10 space-y-2">
        <div className="flex items-center gap-2.5 px-3 py-2.5 bg-white/10">
          <div className={`w-8 h-8 ${meta.color} flex items-center justify-center shrink-0 text-sm`}>
            {meta.emoji}
          </div>
          <div className="min-w-0">
            <p className="text-white text-xs font-semibold truncate">{user?.full_name}</p>
            <p className="text-blue-300 text-xs capitalize">{role}</p>
          </div>
        </div>
        <button onClick={handleSignOut}
          className="w-full flex items-center gap-2.5 px-3 py-2.5 text-blue-300 hover:text-white hover:bg-white/10 text-sm font-medium transition-all duration-150">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/>
          </svg>
          Sign Out
        </button>
      </div>
    </>
  )

  return (
    <div className="min-h-screen flex bg-slate-50 font-sans">

      {/* ── Mobile top bar ── */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-40 bg-navy border-b border-white/10 h-14 flex items-center justify-between px-4">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 bg-brand-500 flex items-center justify-center">
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 3c-4.97 5.06-7 8.36-7 11a7 7 0 0014 0c0-2.64-2.03-5.94-7-11z"/>
            </svg>
          </div>
          <span className="text-white text-sm font-bold font-display">Water District</span>
        </div>
        <button onClick={() => setSidebarOpen(v => !v)} className="p-1">
          <HamburgerIcon open={sidebarOpen} />
        </button>
      </div>

      {/* ── Mobile overlay ── */}
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-30 bg-black/50" onClick={closeSidebar} />
      )}

      {/* ── Mobile drawer ── */}
      <aside className={`lg:hidden fixed top-0 left-0 h-full w-64 bg-navy z-40 flex flex-col shadow-xl transition-transform duration-200
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <SidebarContent />
      </aside>

      {/* ── Desktop sidebar (always visible) ── */}
      <aside className="hidden lg:flex w-64 bg-navy flex-col shrink-0 fixed h-full shadow-xl border-r border-white/5">
        <SidebarContent />
      </aside>

      {/* ── Page content ── */}
      <main className="flex-1 lg:ml-64 overflow-auto min-h-screen pt-14 lg:pt-0">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
          {children}
        </div>
      </main>
    </div>
  )
}
