import { useAnnouncementStore } from '../../store/announcementStore'
import { ANNOUNCEMENT_CATEGORIES } from '../../mock/data'

function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d ago`
  return new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
}

function CategoryBadge({ category }) {
  const cat = ANNOUNCEMENT_CATEGORIES.find(c => c.value === category)
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5  text-xs font-semibold ${cat?.color || 'bg-gray-100 text-gray-600'}`}>
      {cat?.label || category}
    </span>
  )
}

export default function AnnouncementsPage() {
  const announcements = useAnnouncementStore(s => s.announcements)

  const sorted = [...announcements].sort(
    (a, b) => new Date(b.created_at) - new Date(a.created_at)
  )

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Announcements</h1>
        <p className="text-gray-500 text-sm mt-0.5">Official notices from the Water District</p>
      </div>

      {sorted.length === 0 ? (
        <div className="card p-12 text-center">
          <div className="text-4xl mb-3">📢</div>
          <p className="text-gray-500 font-medium">No announcements yet.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {sorted.map((a, i) => (
            <div key={a.id} className={`card p-5 ${i === 0 ? 'border-brand-200 bg-slate-50/30' : ''}`}>
              {i === 0 && (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 bg-brand-100 px-2 py-0.5  mb-3">
                  🔔 Latest
                </span>
              )}
              <div className="flex items-start justify-between gap-4 mb-2">
                <h2 className="font-semibold text-gray-900 text-base leading-snug">{a.title}</h2>
                <CategoryBadge category={a.category} />
              </div>
              <p className="text-sm text-gray-600 leading-relaxed mb-4">{a.content}</p>
              <div className="flex items-center gap-3 text-xs text-gray-400 border-t border-gray-100 pt-3">
                <span>👤 Posted by {a.created_by}</span>
                <span>·</span>
                <span>🕒 {timeAgo(a.created_at)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
