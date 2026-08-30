import { useEffect, useRef, useState } from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import { useNotificationStore } from '../../store/notificationStore'
import CustomerInterruptionBanner from '../ui/CustomerInterruptionBanner'
import { CAPABILITIES, hasCapability } from '../../lib/accessControl'
import { staffAccessLabel } from '../../config/terminology'
import { apiFetch } from '../../lib/api'
import QuickCommandPalette from '../ui/QuickCommandPalette'
import ToastViewport from '../ui/ToastViewport'
import PageHelpTooltip from '../ui/PageHelpTooltip'
import ThemeToggle from '../ui/ThemeToggle'
import { getPageHelp } from '../../config/pageHelp'

const NAV = {
  customer: [
    { to: '/customer/my-complaints', icon: ListIcon,    label: 'My complaints' },
    { to: '/customer/billing',       icon: BillingIcon, label: 'Billing' },
    { to: '/customer/announcements', icon: BellIcon,    label: 'Announcements' },
  ],
  admin: [],
  maintenance_personnel: [
    { to: '/maintenance/tasks',         icon: WrenchIcon, label: 'My tasks' },
    { to: '/maintenance/announcements', icon: BellIcon,   label: 'Announcements' },
  ],
}

function adminNavigation(user) {
  const items = []
  const add = (capability, item) => {
    if (hasCapability(user, capability)) items.push(item)
  }

  add(CAPABILITIES.SUPERVISOR_DASHBOARD, { section: 'System Administration', to: '/system/dashboard', icon: DashIcon, label: 'System analytics' })
  add(CAPABILITIES.COMMERCIAL_COMPLAINTS, { section: 'Commercial Services · NSCCCD', to: '/commercial/dashboard', icon: DashIcon, label: 'Commercial overview' })
  add(CAPABILITIES.COMMERCIAL_COMPLAINTS, { section: 'Commercial Services · NSCCCD', to: '/commercial/complaints', icon: ListIcon, label: 'Complaint review' })
  add(CAPABILITIES.COMMERCIAL_REPORTS, { section: 'Commercial Services · NSCCCD', to: '/commercial/reports', icon: ReportIcon, label: 'Complaint analytics' })
  add(CAPABILITIES.COMMERCIAL_REPORTS, { section: 'Commercial Services · NSCCCD', to: '/commercial/export-center', icon: ExportIcon, label: 'Exports & schedules' })
  add(CAPABILITIES.COMMERCIAL_BILLING, { section: 'Commercial Services · NSCCCD', to: '/commercial/accounts-billing', icon: BillingIcon, label: 'Accounts & billing' })
  add(CAPABILITIES.COMMERCIAL_ANNOUNCEMENTS, { section: 'Commercial Services · NSCCCD', to: '/commercial/service-advisories', icon: BellIcon, label: 'Service advisories' })
  add(CAPABILITIES.ECMD_DISPATCH, { section: 'ECMD · WDLCD', to: '/ecmd/dashboard', icon: DashIcon, label: 'WDLCD overview' })
  add(CAPABILITIES.ECMD_DISPATCH, { section: 'ECMD · WDLCD', to: '/ecmd/dispatch', icon: AssignIcon, label: 'Complaint dispatch' })
  add(CAPABILITIES.ECMD_OPERATIONS, { section: 'ECMD · WDLCD', to: '/ecmd/field-operations', icon: WrenchIcon, label: 'Field operations' })
  add(CAPABILITIES.ECMD_OPERATIONS, { section: 'ECMD · WDLCD', to: '/ecmd/crews', icon: UsersIcon, label: 'Crew management' })
  add(CAPABILITIES.ECMD_OPERATIONS, { section: 'ECMD · WDLCD', to: '/ecmd/availability', icon: CalendarIcon, label: 'Availability calendar' })
  add(CAPABILITIES.SYSTEM_DEPARTMENTS, { section: 'System Administration', to: '/system/departments-access', icon: WrenchIcon, label: 'Departments & access' })
  add(CAPABILITIES.SYSTEM_STAFF, { section: 'System Administration', to: '/system/staff-accounts', icon: UsersIcon, label: 'Staff accounts' })
  add(CAPABILITIES.SYSTEM_AUDIT, { section: 'System Administration', to: '/system/audit-log', icon: AuditIcon, label: 'Activity & security log' })
  add(CAPABILITIES.SUPERVISOR_DASHBOARD, { section: 'System Administration', to: '/system/announcements', icon: BellIcon, label: 'Staff announcements' })
  add(CAPABILITIES.SUPERVISOR_DASHBOARD, { section: 'System Administration', to: '/system/health', icon: HealthIcon, label: 'System health' })
  return items
}

const ROLE_CONFIG = {
  customer:    { tag: 'Customer',      gradient: 'from-blue-500 to-blue-600', dot: '#60a5fa' },
  admin:       { tag: 'Staff Account', gradient: 'from-navy-700 to-navy-900', dot: '#e6b020' },
  maintenance_personnel: { tag: 'Maintenance Personnel', gradient: 'from-amber-500 to-amber-600', dot: '#fbbf24' },
}

// ── SVG Icons ──
function DashIcon({ className }) {
  return <svg className={className} viewBox="0 0 20 20" fill="currentColor"><path d="M5 3a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2V5a2 2 0 00-2-2H5zM5 11a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2v-2a2 2 0 00-2-2H5zM11 5a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V5zM14 11a1 1 0 011 1v1h1a1 1 0 110 2h-1v1a1 1 0 11-2 0v-1h-1a1 1 0 110-2h1v-1a1 1 0 011-1z"/></svg>
}
function UsersIcon({ className }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-1.13a4 4 0 100-8 4 4 0 000 8zm6 2c1.1 0 2 .9 2 2v.01M7 10a4 4 0 100-8 4 4 0 000 8z"/></svg>
}
function ListIcon({ className }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>
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
function ReportIcon({ className }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M3 3v18h18M7 16v-4m5 4V7m5 9v-6"/></svg>
}
function ExportIcon({ className }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M12 3v12m0 0 4-4m-4 4-4-4M5 17v2a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2"/></svg>
}
function CalendarIcon({ className }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M8 3v3m8-3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v14H4V6a1 1 0 0 1 1-1Z"/></svg>
}
function HealthIcon({ className }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M3 12h4l2-5 4 10 2-5h6M5 4h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z"/></svg>
}
function AuditIcon({ className }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5h6m-6 4h6m-6 4h4m-6 8h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z"/></svg>
}
function ProfileIcon({ className }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM4 21a8 8 0 0116 0"/></svg>
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
  const baseConfig = ROLE_CONFIG[role]
  const config = role === 'admin' ? { ...baseConfig, tag: staffAccessLabel(user) } : baseConfig
  const navItems = role === 'admin' ? adminNavigation(user) : (NAV[role] || [])
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [commandOpen, setCommandOpen] = useState(false)
  const [accountMenuOpen, setAccountMenuOpen] = useState(false)
  const [online, setOnline] = useState(() => navigator.onLine)
  const mainRef = useRef(null)
  const accountMenuRef = useRef(null)
  const accountMenuButtonRef = useRef(null)
  const unreadCount = useNotificationStore(state => state.unreadCount)
  const fetchUnreadCount = useNotificationStore(state => state.fetchUnreadCount)
  const clearNotifications = useNotificationStore(state => state.clear)
  const updateStoredUser = useAuthStore(state => state.updateStoredUser)
  const refreshMfaState = useAuthStore(state => state.refreshMfaState)

  useEffect(() => {
    let active = true
    apiFetch('/users/me')
      .then(async result => {
        if (active && result?.user) {
          updateStoredUser(result.user)
          if (result.user.role !== 'customer') await refreshMfaState()
        }
      })
      .catch(() => {})
    return () => { active = false }
  }, [updateStoredUser, refreshMfaState])

  useEffect(() => {
    fetchUnreadCount()
    const interval = window.setInterval(fetchUnreadCount, 60000)
    return () => window.clearInterval(interval)
  }, [fetchUnreadCount])

  const handleSignOut = () => { setAccountMenuOpen(false); clearNotifications(); signOut(); navigate('/', { replace: true }) }
  const closeSidebar  = () => setSidebarOpen(false)
  const openAccountPage = path => { setAccountMenuOpen(false); navigate(path) }

  // Current page label and contextual help
  const currentItem = navItems.find(i => location.pathname.startsWith(i.to))
  const pageHelp = getPageHelp(location.pathname)
  const currentPageLabel = currentItem?.label || pageHelp?.title || 'MRWD'

  useEffect(() => {
    document.title = `${currentPageLabel} · Metro Roxas Water District`
    mainRef.current?.scrollTo({ top: 0, behavior: 'instant' })
  }, [location.pathname, currentPageLabel])

  useEffect(() => {
    if (!accountMenuOpen) return undefined
    const closeOnOutsidePress = event => {
      if (!accountMenuRef.current?.contains(event.target)) setAccountMenuOpen(false)
    }
    const closeOnEscape = event => {
      if (event.key !== 'Escape') return
      setAccountMenuOpen(false)
      accountMenuButtonRef.current?.focus()
    }
    document.addEventListener('pointerdown', closeOnOutsidePress)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePress)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [accountMenuOpen])

  useEffect(() => {
    const onOnline = () => setOnline(true)
    const onOffline = () => setOnline(false)
    const onKeyDown = event => {
      const target = event.target
      const typing = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || target?.isContentEditable
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setCommandOpen(value => !value)
        return
      }
      if (event.key === '/' && !typing) {
        const search = document.querySelector('[data-qol-search="true"]')
        if (search) { event.preventDefault(); search.focus() }
      }
      if (event.key === 'Escape') {
        setSidebarOpen(false)
        setCommandOpen(false)
      }
    }
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [])

  const sidebarContent = (
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
              <span className="text-xs uppercase tracking-widest font-semibold" style={{ color: config.dot }}>{config.tag}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Gold divider */}
      <div className="mx-4 h-px" style={{ background: 'linear-gradient(90deg, transparent, rgba(230,176,32,.4), transparent)' }} />

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5" aria-label={`${config.tag} navigation`}>
        {navItems.map((item, index) => {
          const Icon = item.icon
          return (
            <div key={item.to}>
              {(index === 0 || navItems[index - 1]?.section !== item.section) && (
                <p className="mb-1 mt-4 px-3 text-xs font-black uppercase tracking-[0.16em] text-navy-300 first:mt-0">{item.section}</p>
              )}
              <NavLink to={item.to} onClick={closeSidebar}
              className={({ isActive }) =>
                `group flex min-h-11 w-full items-center gap-3 rounded-full px-3 py-2.5 text-sm font-medium transition-all duration-300 ease-[cubic-bezier(.2,0,0,1)] ${
                  isActive
                    ? 'bg-md-secondary text-md-on-secondary shadow-md-1'
                    : 'text-navy-100 hover:bg-white/10 hover:text-white'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <span className={`w-4 h-4 shrink-0 transition-colors ${isActive ? 'text-navy-800' : 'text-navy-300 group-hover:text-white'}`}>
                    <Icon className="w-full h-full" />
                  </span>
                  <span className="whitespace-nowrap">{item.label}</span>
                  {item.notification && unreadCount > 0 ? <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-gold-400 px-1 text-xs font-black text-navy-950">{unreadCount > 99 ? '99+' : unreadCount}</span> : isActive && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-gold-500" />}
                </>
              )}
              </NavLink>
            </div>
          )
        })}
      </nav>

      {/* Bottom divider */}
      <div className="mx-4 h-px" style={{ background: 'rgba(255,255,255,0.08)' }} />

      {/* User card */}
      <div className="px-3 py-4 shrink-0">
        <div className="mb-2 flex items-center gap-2.5 rounded-3xl bg-white/10 px-3 py-2.5">
          <div className="w-8 h-8 rounded-full flex items-center justify-center text-[13px] font-black text-navy-900 shrink-0"
               style={{ background: 'linear-gradient(135deg, #e6b020, #c9921a)' }}>
            {user?.full_name?.charAt(0) || '?'}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-white text-[13px] font-semibold truncate leading-tight">{user?.full_name}</p>
            <p className="text-navy-300 text-xs uppercase tracking-wider">{config.tag}</p>
          </div>
        </div>
        <button onClick={handleSignOut}
          className="flex min-h-11 w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-navy-300 transition-all hover:bg-white/8 hover:text-white">
          <SignOutIcon className="w-4 h-4" />
          Sign out
        </button>
      </div>
    </div>
  )

  return (
    <div className="app-shell min-h-screen min-w-0 max-w-full overflow-x-clip flex font-sans">
      <a href="#main-content" className="skip-link">Skip to main content</a>

      {/* ── Mobile overlay ── */}
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-30 bg-navy-950/60 backdrop-blur-sm" onClick={closeSidebar} aria-hidden="true" />
      )}

      {/* ── Sidebar ── */}
      <aside id="primary-navigation" aria-label="Primary navigation" className={`
        page-band wave-sidebar fixed top-0 left-0 h-full z-40 flex flex-col shadow-sidebar
        lg:translate-x-0 transition-transform duration-200
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `} style={{ width: 240 }}>
        {sidebarContent}
      </aside>

      {/* ── Main area ── */}
      <div className="min-w-0 flex-1 flex flex-col min-h-screen" style={{ marginLeft: 0 }}>
        <div className="lg:ml-60 min-w-0 flex flex-col min-h-screen">

          {/* ── Top bar ── */}
          <header className="app-topbar sticky top-0 z-20 flex h-16 min-w-0 items-center justify-between gap-2 px-3 sm:px-6">

            {/* Left: hamburger + breadcrumb */}
            <div className="min-w-0 flex items-center gap-2 sm:gap-3">
              <button type="button" onClick={() => navigate(-1)} className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 shadow-sm transition hover:border-navy-200 hover:text-navy-800 lg:flex" aria-label="Go back" title="Go back">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/></svg>
              </button>
              <button onClick={() => setSidebarOpen(v => !v)}
                className="flex h-11 w-11 items-center justify-center rounded-lg text-gray-600 transition-colors hover:bg-gray-200 lg:hidden"
                aria-label="Toggle navigation" aria-expanded={sidebarOpen} aria-controls="primary-navigation">
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
              {currentPageLabel !== 'MRWD' && (
                <div className="hidden lg:flex items-center gap-2 text-sm">
                  <span className="text-gray-500">Metro Roxas Water District</span>
                  <span className="text-gray-300">/</span>
                  <span className="font-semibold text-navy-900">{currentPageLabel}</span>
                </div>
              )}
            </div>

            {/* Right: date + avatar */}
            <div className="shrink-0 flex items-center gap-2 sm:gap-3">
              <button type="button" onClick={() => setCommandOpen(true)} className="hidden min-h-11 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 text-xs font-bold text-gray-600 shadow-sm transition hover:border-navy-200 hover:text-navy-800 md:flex" aria-label="Open quick find">
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="11" cy="11" r="7"/><path strokeLinecap="round" d="m20 20-4-4"/></svg>
                <span>Quick find</span><span className="rounded border border-gray-200 bg-gray-50 px-1 py-0.5 text-xs text-gray-600">⌘K</span>
              </button>
              <button type="button" onClick={() => setCommandOpen(true)} className="flex h-11 w-11 items-center justify-center rounded-lg text-gray-600 hover:bg-white md:hidden" aria-label="Open quick find">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="11" cy="11" r="7"/><path strokeLinecap="round" d="m20 20-4-4"/></svg>
              </button>
              <PageHelpTooltip key={pageHelp?.title || location.pathname} help={pageHelp} />
              <span className="hidden sm:block text-xs text-gray-500">
                {new Date().toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric' })}
              </span>
              <button onClick={() => navigate('/notifications')} className="relative flex h-11 w-11 items-center justify-center rounded-lg text-gray-600 hover:bg-white"
                aria-label={unreadCount ? `Notifications, ${unreadCount} unread` : 'Notifications'}>
                <BellIcon className="w-4 h-4" />
                {unreadCount > 0 && <span className="absolute right-0 top-0 flex min-h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-xs font-black text-white">{unreadCount > 9 ? '9+' : unreadCount}</span>}
              </button>
              <div ref={accountMenuRef} className="relative">
                <button
                  ref={accountMenuButtonRef}
                  type="button"
                  onClick={() => setAccountMenuOpen(value => !value)}
                  className="account-menu__trigger relative flex h-11 w-11 items-center justify-center rounded-full text-xs font-black text-navy-900 shadow-sm transition-transform hover:scale-105"
                  style={{ background: 'linear-gradient(135deg, #e6b020, #c9921a)' }}
                  aria-label="Account menu"
                  aria-haspopup="true"
                  aria-expanded={accountMenuOpen}
                  aria-controls="account-menu"
                  title="Account menu"
                >
                  {user?.full_name?.charAt(0)?.toUpperCase() || '?'}
                  <span className="absolute -bottom-0.5 -right-0.5 grid h-4 w-4 place-items-center rounded-full border-2 border-white bg-navy-800 text-white" aria-hidden="true">
                    <svg className={`h-2.5 w-2.5 transition-transform ${accountMenuOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="m7 10 5 5 5-5"/></svg>
                  </span>
                </button>

                {accountMenuOpen && (
                  <div id="account-menu" className="account-menu absolute right-0 top-[calc(100%+0.75rem)] z-50 w-[min(18rem,calc(100vw-1.5rem))] rounded-3xl border border-gray-200 bg-white p-2 shadow-2xl" aria-label="Account options">
                    <div className="rounded-2xl bg-navy-50 px-3 py-3">
                      <div className="flex items-center gap-3">
                        <div className="account-menu__avatar grid h-10 w-10 shrink-0 place-items-center rounded-full text-sm font-black text-navy-900" style={{ background: 'linear-gradient(135deg, #e6b020, #c9921a)' }}>
                          {user?.full_name?.charAt(0)?.toUpperCase() || '?'}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-black text-navy-900">{user?.full_name || 'MRWD user'}</p>
                          <p className="truncate text-xs text-gray-500">{user?.email || config.tag}</p>
                        </div>
                      </div>
                      <div className="mt-2 flex items-center gap-2 text-xs font-bold text-gray-600">
                        <span className={`h-2 w-2 rounded-full ${online ? 'bg-green-500' : 'bg-amber-500'}`} />
                        {online ? 'Online' : 'Offline'} · {config.tag}
                      </div>
                    </div>

                    <div className="mt-2 space-y-1">
                      <button type="button" onClick={() => openAccountPage('/profile')} className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-gray-700 transition hover:bg-gray-100">
                        <ProfileIcon className="h-5 w-5 text-navy-700" />
                        <span><span className="block text-sm font-bold">My profile</span><span className="block text-xs text-gray-500">Personal details and security</span></span>
                      </button>
                      <button type="button" onClick={() => openAccountPage('/notifications')} className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-gray-700 transition hover:bg-gray-100">
                        <span className="relative"><BellIcon className="h-5 w-5 text-navy-700" />{unreadCount > 0 && <span className="absolute -right-2 -top-2 h-2.5 w-2.5 rounded-full border-2 border-white bg-red-600" />}</span>
                        <span className="min-w-0 flex-1"><span className="block text-sm font-bold">Notifications</span><span className="block text-xs text-gray-500">{unreadCount ? `${unreadCount} unread` : 'You are all caught up'}</span></span>
                        {unreadCount > 0 && <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-black text-red-700">{unreadCount > 99 ? '99+' : unreadCount}</span>}
                      </button>
                      <ThemeToggle variant="menu" />
                    </div>

                    <div className="my-2 h-px bg-gray-200" />
                    <button type="button" onClick={handleSignOut} className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-red-700 transition hover:bg-red-50">
                      <SignOutIcon className="h-5 w-5" />
                      <span className="text-sm font-bold">Sign out</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </header>

          {!online && <div className="relative z-10 border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-xs font-bold text-amber-900" role="status">You are offline. You can keep reviewing loaded information, but changes will not save until the connection returns.</div>}

          {/* ── Page content ── */}
          <main ref={mainRef} id="main-content" tabIndex={-1} className="app-main min-w-0 flex-1 overflow-x-hidden overflow-y-auto">
            <div className="mx-auto w-full min-w-0 max-w-7xl px-3 min-[360px]:px-4 sm:px-6 py-5 sm:py-8">
              {role === 'customer' && <CustomerInterruptionBanner />}
              {children}
            </div>
          </main>

          {/* ── Footer ── */}
          <footer className="app-footer border-t border-gray-200/60 px-3 py-3 text-center text-xs text-gray-600 sm:px-6">
            Metro Roxas Water District © {new Date().getFullYear()} · All rights reserved
          </footer>
        </div>
      </div>
      {commandOpen && <QuickCommandPalette onClose={() => setCommandOpen(false)} navItems={navItems} />}
      <ToastViewport />
    </div>
  )
}
