import { useState } from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'

const NAV = {
  customer: [
    { to: '/customer/submit',        icon: FileIcon,    label: 'Submit Complaint' },
    { to: '/customer/my-complaints', icon: ListIcon,    label: 'My Complaints' },
    { to: '/customer/billing',       icon: BillingIcon, label: 'Billing' },
    { to: '/customer/announcements', icon: BellIcon,    label: 'Announcements' },
  ],
  admin: [
    { to: '/admin/dashboard',     icon: DashIcon,    label: 'Dashboard' },
    { to: '/admin/complaints',    icon: ListIcon,    label: 'All Complaints' },
    { to: '/admin/assign',        icon: AssignIcon,  label: 'Assign Tasks' },
    { to: '/admin/announcements', icon: BellIcon,    label: 'Announcements' },
  ],
  maintenance: [
    { to: '/maintenance/tasks',         icon: WrenchIcon, label: 'My Tasks' },
    { to: '/maintenance/announcements', icon: BellIcon,   label: 'Announcements' },
  ],
}

const ROLE_CONFIG = {
  customer:    { tag: 'Consumer',   gradient: 'from-blue-500 to-blue-600',   dot: '#60a5fa' },
  admin:       { tag: 'Admin',      gradient: 'from-navy-700 to-navy-900',   dot: '#e6b020' },
  maintenance: { tag: 'Technician', gradient: 'from-amber-500 to-amber-600', dot: '#fbbf24' },
}

// ── SVG Icons ──
function DashIcon({ className }) {
  return <svg className={className} viewBox="0 0 20 20" fill="currentColor"><path d="M5 3a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2V5a2 2 0 00-2-2H5zM5 11a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2v-2a2 2 0 00-2-2H5zM11 5a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V5zM14 11a1 1 0 011 1v1h1a1 1 0 110 2h-1v1a1 1 0 11-2 0v-1h-1a1 1 0 110-2h1v-1a1 1 0 011-1z"/></svg>
}
function ListIcon({ className }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>
}
function FileIcon({ className }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
}
function BillingIcon({ className }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z"/></svg>
}
function BellIcon({ className }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/></svg>
}
function AssignIcon({ className }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
}
function WrenchIcon({ className }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
}
function SignOutIcon({ className }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/></svg>
}

// Water droplet seal
function WaterSeal({ size = 40 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="sealGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#e6b020"/>
          <stop offset="100%" stopColor="#c9921a"/>
        </linearGradient>
      </defs>
      {/* Outer ring */}
      <circle cx="40" cy="40" r="37" fill="none" stroke="url(#sealGrad)" strokeWidth="1.5" opacity="0.8"/>
      <circle cx="40" cy="40" r="31" fill="none" stroke="url(#sealGrad)" strokeWidth="0.75" opacity="0.4" strokeDasharray="3 2"/>
      {/* Water drop */}
      <path d="M40 14 C28 26 20 34 20 42 a20 20 0 0 0 40 0 C60 34 52 26 40 14Z"
        fill="url(#sealGrad)" opacity="0.9"/>
      {/* Highlight */}
      <ellipse cx="33" cy="38" rx="4" ry="6" fill="white" opacity="0.3" transform="rotate(-20 33 38)"/>
      {/* Rays */}
      {[0,40,80,120,160,200,240,280,320].map((deg, i) => {
        const r = Math.PI * deg / 180
        return <line key={i}
          x1={40 + 33 * Math.cos(r)} y1={40 + 33 * Math.sin(r)}
          x2={40 + 37 * Math.cos(r)} y2={40 + 37 * Math.sin(r)}
          stroke="url(#sealGrad)" strokeWidth="2" opacity="0.7"/>
      })}
    </svg>
  )
}

export default function AppLayout({ children }) {
  const user     = useAuthStore(s => s.user)
  const signOut  = useAuthStore(s => s.signOut)
  const navigate = useNavigate()
  const location = useLocation()
  const role     = user?.role || 'customer'
  const config   = ROLE_CONFIG[role]
  const navItems = NAV[role] || []
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const handleSignOut = () => { signOut(); navigate('/', { replace: true }) }
  const closeSidebar  = () => setSidebarOpen(false)

  // Current page label
  const currentItem = navItems.find(i => location.pathname.startsWith(i.to))

  const SidebarContent = () => (
    <div className="flex flex-col h-full scrollbar-thin overflow-y-auto">
      {/* Brand header */}
      <div className="px-4 pt-6 pb-5 shrink-0">
        <div className="flex items-center gap-3">
          <WaterSeal size={42} />
          <div>
            <p className="font-display font-bold text-white text-[13px] leading-tight">Metro Roxas</p>
            <p className="font-display font-bold text-white text-[13px] leading-tight">Water District</p>
            <div className="mt-1 flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full" style={{ background: config.dot }}></div>
              <span className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: config.dot }}>{config.tag}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Gold divider */}
      <div className="mx-4 h-px" style={{ background: 'linear-gradient(90deg, transparent, rgba(230,176,32,.4), transparent)' }} />

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {navItems.map(item => {
          const Icon = item.icon
          return (
            <NavLink key={item.to} to={item.to} onClick={closeSidebar}
              className={({ isActive }) =>
                `group flex items-center gap-3 px-3 py-2.5 text-sm font-medium transition-all duration-150 rounded-lg ${
                  isActive
                    ? 'bg-white/15 text-white shadow-sm'
                    : 'text-navy-200 hover:bg-white/8 hover:text-white'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <span className={`w-4 h-4 shrink-0 transition-colors ${isActive ? 'text-gold-300' : 'text-navy-400 group-hover:text-white'}`}>
                    <Icon className="w-full h-full" />
                  </span>
                  <span>{item.label}</span>
                  {isActive && <span className="ml-auto w-1 h-1 rounded-full bg-gold-400" />}
                </>
              )}
            </NavLink>
          )
        })}
      </nav>

      {/* Bottom divider */}
      <div className="mx-4 h-px" style={{ background: 'rgba(255,255,255,0.08)' }} />

      {/* User card */}
      <div className="px-3 py-4 shrink-0">
        <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg bg-white/8 mb-2">
          <div className="w-8 h-8 rounded-full flex items-center justify-center text-[13px] font-black text-navy-900 shrink-0"
               style={{ background: 'linear-gradient(135deg, #e6b020, #c9921a)' }}>
            {user?.full_name?.charAt(0) || '?'}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-white text-[13px] font-semibold truncate leading-tight">{user?.full_name}</p>
            <p className="text-navy-300 text-[10px] uppercase tracking-wider capitalize">{role}</p>
          </div>
        </div>
        <button onClick={handleSignOut}
          className="w-full flex items-center gap-2.5 px-3 py-2 text-navy-300 hover:text-white hover:bg-white/8 text-sm font-medium transition-all rounded-lg">
          <SignOutIcon className="w-4 h-4" />
          Sign Out
        </button>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen flex font-sans" style={{ background: '#f4f7fb' }}>

      {/* ── Mobile overlay ── */}
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-30 bg-navy-950/60 backdrop-blur-sm" onClick={closeSidebar} />
      )}

      {/* ── Sidebar ── */}
      <aside className={`
        fixed top-0 left-0 h-full z-40 flex flex-col shadow-sidebar
        lg:translate-x-0 transition-transform duration-200
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `} style={{ width: 240, background: 'linear-gradient(180deg, #0f2240 0%, #1b3366 60%, #0f2240 100%)' }}>
        <SidebarContent />
      </aside>

      {/* ── Main area ── */}
      <div className="flex-1 flex flex-col min-h-screen" style={{ marginLeft: 0 }}>
        <div className="lg:ml-60 flex flex-col min-h-screen">

          {/* ── Top bar ── */}
          <header className="sticky top-0 z-20 h-14 flex items-center justify-between px-4 sm:px-6"
            style={{ background: 'rgba(244,247,251,0.85)', backdropFilter: 'blur(12px)', borderBottom: '1px solid rgba(0,0,0,.06)', boxShadow: '0 1px 0 rgba(0,0,0,.04), 0 4px 16px rgba(0,0,0,.04)' }}>

            {/* Left: hamburger + breadcrumb */}
            <div className="flex items-center gap-3">
              <button onClick={() => setSidebarOpen(v => !v)}
                className="lg:hidden w-8 h-8 flex items-center justify-center rounded-lg text-gray-600 hover:bg-gray-200 transition-colors">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h7"/>
                </svg>
              </button>

              {/* Mobile logo */}
              <div className="lg:hidden flex items-center gap-2">
                <WaterSeal size={28} />
                <span className="font-display font-bold text-navy-900 text-sm">MRWD</span>
              </div>

              {/* Breadcrumb - desktop */}
              {currentItem && (
                <div className="hidden lg:flex items-center gap-2 text-sm">
                  <span className="text-gray-400">Metro Roxas Water District</span>
                  <span className="text-gray-300">/</span>
                  <span className="font-semibold text-navy-900">{currentItem.label}</span>
                </div>
              )}
            </div>

            {/* Right: date + avatar */}
            <div className="flex items-center gap-3">
              <span className="hidden sm:block text-xs text-gray-400">
                {new Date().toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric' })}
              </span>
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-black text-navy-900 cursor-default"
                   style={{ background: 'linear-gradient(135deg, #e6b020, #c9921a)' }}>
                {user?.full_name?.charAt(0) || '?'}
              </div>
            </div>
          </header>

          {/* ── Page content ── */}
          <main className="flex-1 overflow-auto">
            <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
              {children}
            </div>
          </main>

          {/* ── Footer ── */}
          <footer className="px-6 py-3 text-center text-[11px] text-gray-400 border-t border-gray-200/60">
            Metro Roxas Water District © {new Date().getFullYear()} · All rights reserved
          </footer>
        </div>
      </div>
    </div>
  )
}
