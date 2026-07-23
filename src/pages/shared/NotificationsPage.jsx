import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useNotificationStore } from '../../store/notificationStore'
import { ErrorBanner, PageLoader } from '../../components/ui/Feedback'

function formatDate(value) {
  return new Date(value).toLocaleString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}

const ICON = { assignment: '👷', status: '↻', completed: '✓', warning: '!', feedback: '★', new: '+', info: 'i' }

export default function NotificationsPage() {
  const navigate = useNavigate()
  const notifications = useNotificationStore(s => s.notifications)
  const unreadCount = useNotificationStore(s => s.unreadCount)
  const loading = useNotificationStore(s => s.loading)
  const error = useNotificationStore(s => s.error)
  const fetchNotifications = useNotificationStore(s => s.fetchNotifications)
  const markRead = useNotificationStore(s => s.markRead)
  const markAllRead = useNotificationStore(s => s.markAllRead)

  useEffect(() => { fetchNotifications().catch(() => {}) }, [fetchNotifications])

  const openNotification = async item => {
    if (!item.read_at) await markRead(item.id).catch(() => {})
    if (item.related_complaint_id) navigate(`/complaints/${item.related_complaint_id}`)
  }

  if (loading && notifications.length === 0) return <PageLoader label="Loading notifications..." />

  return (
    <div className="space-y-5">
      <div className="page-band wave-header rounded-2xl px-6 py-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <p className="text-gold-400 text-[11px] font-bold uppercase tracking-[.15em]">Account Center</p>
            <h1 className="font-display font-black text-white text-2xl sm:text-3xl mt-1">Notifications</h1>
            <p className="text-navy-300 text-sm mt-1">Status changes, assignments, feedback, and requests that need attention.</p>
          </div>
          <div className="text-right"><p className="font-display font-black text-5xl text-gold-400 leading-none">{unreadCount}</p><p className="text-navy-300 text-[11px] uppercase">unread</p></div>
        </div>
      </div>

      {error && <ErrorBanner message={error} onRetry={fetchNotifications} />}
      {notifications.length > 0 && unreadCount > 0 && (
        <div className="flex justify-end"><button onClick={markAllRead} className="btn-secondary rounded-lg text-sm">Mark all as read</button></div>
      )}

      {notifications.length === 0 ? (
        <div className="card rounded-xl p-14 text-center"><div className="text-5xl mb-3">🔔</div><h2 className="font-display font-bold text-navy-900">You are all caught up</h2><p className="text-sm text-gray-400 mt-2">New updates will appear here.</p></div>
      ) : (
        <div className="card rounded-xl overflow-hidden divide-y divide-gray-100">
          {notifications.map(item => (
            <button key={item.id} onClick={() => openNotification(item)} className={`w-full text-left p-4 sm:p-5 flex gap-4 hover:bg-gray-50 transition-colors ${item.read_at ? 'bg-white' : 'bg-brand-50/50'}`}>
              <div className={`w-10 h-10 rounded-full flex items-center justify-center font-black shrink-0 ${item.read_at ? 'bg-gray-100 text-gray-500' : 'bg-navy-800 text-white'}`}>{ICON[item.notification_type] || 'i'}</div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3"><p className="font-bold text-gray-900">{item.title}</p><span className="text-[11px] text-gray-400 whitespace-nowrap">{formatDate(item.created_at)}</span></div>
                <p className="text-sm text-gray-600 mt-1 leading-relaxed">{item.message}</p>
                {item.related_complaint_id && <p className="text-xs font-bold text-brand-700 mt-2">Open related complaint →</p>}
              </div>
              {!item.read_at && <span className="w-2 h-2 rounded-full bg-brand-500 mt-2 shrink-0" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
