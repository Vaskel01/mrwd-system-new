import { useAnnouncementStore } from '../../store/announcementStore'
import { useState, useEffect } from 'react'
import { PageLoader, ErrorBanner, EmptyState } from '../../components/ui/Feedback'

function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime()
  const days = Math.floor(diff / 86400000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days} days ago`
  return new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
}

const CAT_CONFIG = {
  maintenance:  { bar: 'bg-purple-500', label: 'Maintenance',  text: 'text-purple-700', bg: 'bg-purple-50', border: 'border-purple-200' },
  billing:      { bar: 'bg-navy-500',   label: 'Billing',      text: 'text-navy-700',  bg: 'bg-navy-50',   border: 'border-navy-200' },
  interruption: { bar: 'bg-red-500',    label: 'Interruption', text: 'text-red-700',    bg: 'bg-red-50',    border: 'border-red-200' },
  general:      { bar: 'bg-gray-400',   label: 'General',      text: 'text-gray-600',   bg: 'bg-gray-50',   border: 'border-gray-200' },
  advisory:     { bar: 'bg-green-500',  label: 'Advisory',     text: 'text-green-700',  bg: 'bg-green-50',  border: 'border-green-200' },
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
  const announcements = useAnnouncementStore(s => s.announcements)
  const loading = useAnnouncementStore(s => s.loading)
  const error = useAnnouncementStore(s => s.error)
  const fetchAnnouncements = useAnnouncementStore(s => s.fetchAnnouncements)
  const [activeCategory, setActiveCategory] = useState('all')

  useEffect(() => { fetchAnnouncements() }, [fetchAnnouncements])

  const sorted = [...announcements].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
  const filtered = activeCategory === 'all' ? sorted : sorted.filter(a => a.category === activeCategory)
  const categories = ['all', ...new Set(announcements.map(a => a.category))]

  if (loading && announcements.length === 0) {
    return <PageLoader label="Loading announcements..." />
  }

  if (announcements.length === 0) {
    return (
      <div>
        <div className="page-band rounded-2xl px-6 py-6 relative overflow-hidden mb-5">
          <p className="text-gold-400 text-[11px] font-bold uppercase tracking-[.15em] mb-1.5">Official Notices</p>
          <h1 className="font-display font-black text-white text-2xl sm:text-3xl">Announcements</h1>
        </div>
        {error
          ? <ErrorBanner message={error} onRetry={fetchAnnouncements} />
          : <EmptyState icon="📢" title="No announcements posted yet." />
        }
      </div>
    )
  }

  const latest = sorted[0]
  const rest   = filtered.slice(filtered[0]?.id === latest.id ? 1 : 0)

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="page-band rounded-2xl px-6 py-6 relative overflow-hidden">
        <svg className="absolute bottom-0 left-0 right-0 w-full opacity-10" viewBox="0 0 1200 60" preserveAspectRatio="none">
          <path d="M0,30 C200,0 400,60 600,30 C800,0 1000,60 1200,30 L1200,60 L0,60 Z" fill="white"/>
        </svg>
        <div className="relative flex items-end justify-between">
          <div>
            <p className="text-gold-400 text-[11px] font-bold uppercase tracking-[.15em] mb-1.5">Official Notices</p>
            <h1 className="font-display font-black text-white text-2xl sm:text-3xl">Announcements</h1>
          </div>
          <p className="font-display font-black text-5xl leading-none" style={{ color: '#e6b020' }}>{announcements.length}</p>
        </div>
      </div>

      {/* Latest — pinned, featured */}
      {(activeCategory === 'all' || latest.category === activeCategory) && (
        <div className="card rounded-xl border-2 border-gold-400 mb-5 overflow-hidden">
          <div className={`h-1.5 ${CAT_CONFIG[latest.category]?.bar || 'bg-gray-400'}`} />
          <div className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xs font-black text-navy-800 bg-gold-100 px-2 py-0.5 uppercase tracking-widest">📌 Latest</span>
              <CategoryPill category={latest.category} />
            </div>
            <h2 className="font-black text-gray-900 text-base sm:text-lg tracking-tight mb-2 leading-snug">{latest.title}</h2>
            <p className="text-sm text-gray-600 leading-relaxed mb-4">{latest.content}</p>
            <div className="flex items-center gap-3 text-xs text-gray-400 border-t border-gray-100 pt-3">
              <span className="font-semibold text-gray-600">{latest.created_by_name}</span>
              <span>·</span>
              <span>{timeAgo(latest.created_at)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Category filter */}
      {categories.length > 2 && (
        <div className="flex flex-wrap gap-1 mb-4">
          {categories.map(cat => {
            const cfg = CAT_CONFIG[cat]
            return (
              <button key={cat} onClick={() => setActiveCategory(cat)}
                className={`text-xs font-black px-3 py-1.5 border uppercase tracking-wide transition-colors ${
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
                  <div className="text-xs text-gray-400 flex items-center gap-2">
                    <span className="font-semibold text-gray-500">{a.created_by_name}</span>
                    <span>·</span>
                    <span>{timeAgo(a.created_at)}</span>
                  </div>
                </div>
              </div>
            </div>
          )
        })}
        {rest.length === 0 && filtered.length <= 1 && activeCategory !== 'all' && (
          <p className="text-sm text-gray-400 text-center py-8">No other announcements in this category.</p>
        )}
      </div>
    </div>
  )
}
