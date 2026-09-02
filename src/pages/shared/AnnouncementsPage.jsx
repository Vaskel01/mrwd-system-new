import { useAnnouncementStore } from '../../store/announcementStore'
import { useState, useEffect } from 'react'
import { PageLoader, ErrorBanner, EmptyState } from '../../components/ui/Feedback'
import AppIcon from '../../components/ui/AppIcon'
import { useAuthStore } from '../../store/authStore'
import { TERMS } from '../../config/terminology'

function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime()
  const days = Math.floor(diff / 86400000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days} days ago`
  return new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
}

const NEUTRAL_CATEGORY = { bar: 'bg-gray-200', text: 'text-gray-700', bg: 'bg-gray-100', border: 'border-gray-200' }

const CAT_CONFIG = {
  maintenance:  { ...NEUTRAL_CATEGORY, label: 'Maintenance' },
  billing:      { ...NEUTRAL_CATEGORY, label: 'Billing' },
  interruption: { bar: 'bg-red-500', label: 'Interruption', text: 'text-red-700', bg: 'bg-red-50', border: 'border-red-200' },
  general:      { ...NEUTRAL_CATEGORY, label: 'General' },
  advisory:     { ...NEUTRAL_CATEGORY, label: 'Advisory' },
}

function CategoryPill({ category }) {
  const cfg = CAT_CONFIG[category] || CAT_CONFIG.general
  return (
    <span className={`inline-flex items-center px-2 py-0.5 text-xs font-black uppercase tracking-wide ${cfg.text} ${cfg.bg} border ${cfg.border}`}>
      {cfg.label}
    </span>
  )
}

export default function AnnouncementsPage() {
  const user = useAuthStore(state => state.user)
  const announcements = useAnnouncementStore(s => s.announcements)
  const loading = useAnnouncementStore(s => s.loading)
  const error = useAnnouncementStore(s => s.error)
  const fetchAnnouncements = useAnnouncementStore(s => s.fetchAnnouncements)
  const [activeCategory, setActiveCategory] = useState('all')

  useEffect(() => { fetchAnnouncements() }, [fetchAnnouncements])

  const sorted = [...announcements].sort((a, b) =>
    Number(Boolean(b.is_important)) - Number(Boolean(a.is_important)) ||
    new Date(b.created_at) - new Date(a.created_at))
  const filtered = activeCategory === 'all' ? sorted : sorted.filter(a => a.category === activeCategory)
  const categories = ['all', ...new Set(announcements.map(a => a.category))]
  const pageTitle = user?.role === 'customer' ? TERMS.SERVICE_ADVISORIES : 'Announcements'

  if (loading && announcements.length === 0) {
    return <PageLoader label={`Loading ${pageTitle.toLowerCase()}…`} />
  }

  if (announcements.length === 0) {
    return (
      <div>
        <div className="page-band wave-header page-header mb-5">
          <p className="text-gold-400 text-xs font-bold uppercase tracking-[.15em] mb-1.5">MRWD updates</p>
          <h1 className="font-display font-black text-white text-2xl sm:text-3xl">{pageTitle}</h1>
        </div>
        {error
          ? <ErrorBanner message={error} onRetry={fetchAnnouncements} />
          : <EmptyState icon={<AppIcon name="announcement" className="h-10 w-10" />} title={`No ${pageTitle.toLowerCase()} yet`} />
        }
      </div>
    )
  }

  const important = filtered.filter(item => item.is_important)
  const rest = filtered.filter(item => !item.is_important)

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="page-band wave-header page-header">
        <div className="relative flex items-end justify-between">
          <div>
            <p className="text-gold-400 text-xs font-bold uppercase tracking-[.15em] mb-1.5">MRWD updates</p>
            <h1 className="font-display font-black text-white text-2xl sm:text-3xl">{pageTitle}</h1>
          </div>
          <p className="font-display text-5xl font-black leading-none text-gold-400">{announcements.length}</p>
        </div>
      </div>

      {/* Explicitly Important notices — featured above regular notices */}
      {important.map(item => (
        <div key={item.id} className="card rounded-xl border-2 border-gold-400 overflow-hidden">
          <div className={`h-1.5 ${CAT_CONFIG[item.category]?.bar || 'bg-gray-400'}`} />
          <div className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <span className="inline-flex items-center gap-1 text-xs font-black text-navy-800 bg-gold-100 px-2 py-0.5 uppercase tracking-widest"><AppIcon name="alert" className="h-3.5 w-3.5" />Important</span>
              <CategoryPill category={item.category} />
            </div>
            <h2 className="font-black text-gray-900 text-base sm:text-lg tracking-tight mb-2 leading-snug">{item.title}</h2>
            <p className="text-sm text-gray-600 leading-relaxed mb-4">{item.content}</p>
            <div className="flex items-center gap-3 text-xs text-gray-500 border-t border-gray-100 pt-3">
              <span className="font-semibold text-gray-600">{item.created_by_name}</span>
              <span>·</span>
              <span>{timeAgo(item.created_at)}</span>
            </div>
          </div>
        </div>
      ))}

      {/* Category filter */}
      {categories.length > 2 && (
        <div className="flex flex-wrap gap-1 mb-4">
          {categories.map(cat => {
            const cfg = CAT_CONFIG[cat]
            return (
              <button key={cat} onClick={() => setActiveCategory(cat)} aria-pressed={activeCategory === cat}
                className={`filter-chip text-xs font-black px-3 py-1.5 border uppercase tracking-wide transition-colors ${
                  activeCategory === cat
                    ? 'bg-navy-900 text-white border-navy-900'
                    : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'
                }`}>
                {cat === 'all' ? 'All' : cfg?.label || cat}
              </button>
            )
          })}
        </div>
      )}

      {/* Remaining announcements */}
      <div className="space-y-2">
        {rest.map(a => {
          const cfg = CAT_CONFIG[a.category] || CAT_CONFIG.general
          return (
            <div key={a.id} className="card rounded-xl overflow-hidden">
              <div className={`border-l-4 ${cfg.bar.replace('bg-','border-l-')}`}>
                <div className="p-4">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <h2 className="font-black text-gray-900 text-sm leading-snug tracking-tight">{a.title}</h2>
                    <CategoryPill category={a.category} />
                  </div>
                  <p className="text-sm text-gray-600 leading-relaxed mb-3">{a.content}</p>
                  <div className="text-xs text-gray-500 flex items-center gap-2">
                    <span className="font-semibold text-gray-500">{a.created_by_name}</span>
                    <span>·</span>
                    <span>{timeAgo(a.created_at)}</span>
                  </div>
                </div>
              </div>
            </div>
          )
        })}
        {rest.length === 0 && important.length === 0 && (
          <p className="text-sm text-gray-500 text-center py-8">No updates match this category.</p>
        )}
      </div>
    </div>
  )
}
