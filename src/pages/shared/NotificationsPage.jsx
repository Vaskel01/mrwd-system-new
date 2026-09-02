import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useNotificationStore } from '../../store/notificationStore'
import { EmptyState, ErrorBanner, PageLoader } from '../../components/ui/Feedback'
import AppIcon from '../../components/ui/AppIcon'
import Pagination from '../../components/ui/Pagination'
import SearchField from '../../components/ui/SearchField'
import { readWorkspacePreferences, writeWorkspacePreferences } from '../../lib/workspacePreferences'

function formatDate(value) {
  return new Date(value).toLocaleString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}

const ICONS = {
  assignment: 'assignment',
  status: 'refresh',
  completed: 'check',
  warning: 'alert',
  feedback: 'star',
  new: 'document',
  info: 'info',
}

const ACTION_TYPES = new Set(['assignment', 'warning', 'feedback'])

function needsAction(item) {
  if (!item.related_complaint_id) return false
  if (ACTION_TYPES.has(item.notification_type)) return true
  return /action|assigned|blocked|feedback|information|review|reply|request/i.test(`${item.title || ''} ${item.message || ''}`)
}

function actionLabel(item) {
  if (item.notification_type === 'assignment') return 'Open assigned task →'
  if (item.notification_type === 'feedback') return 'Review feedback →'
  if (item.notification_type === 'warning') return 'Review issue →'
  return needsAction(item) ? 'Open and respond →' : 'Open complaint →'
}

export default function NotificationsPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const initialPreferences = useMemo(() => readWorkspacePreferences('notifications'), [])
  const notifications = useNotificationStore(state => state.notifications)
  const unreadCount = useNotificationStore(state => state.unreadCount)
  const total = useNotificationStore(state => state.total)
  const page = useNotificationStore(state => state.page)
  const pageSize = useNotificationStore(state => state.pageSize)
  const loading = useNotificationStore(state => state.loading)
  const error = useNotificationStore(state => state.error)
  const fetchNotifications = useNotificationStore(state => state.fetchNotifications)
  const markRead = useNotificationStore(state => state.markRead)
  const markAllRead = useNotificationStore(state => state.markAllRead)
  const dismiss = useNotificationStore(state => state.dismiss)
  const requestedPage = Math.max(1, Number(searchParams.get('page')) || 1)
  const [view, setView] = useState(() => initialPreferences.view || 'action')
  const [query, setQuery] = useState(() => initialPreferences.q || '')

  useEffect(() => { fetchNotifications(requestedPage).catch(() => {}) }, [fetchNotifications, requestedPage])
  useEffect(() => { writeWorkspacePreferences('notifications', { view, q: query }) }, [view, query])

  const visibleNotifications = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    return notifications.filter(item => {
      if (view === 'action' && !needsAction(item)) return false
      if (view === 'unread' && item.read_at) return false
      if (!normalizedQuery) return true
      return [item.title, item.message, item.notification_type].some(value => String(value || '').toLowerCase().includes(normalizedQuery))
    })
  }, [notifications, query, view])

  const actionCount = notifications.filter(needsAction).length
  const pageUnreadCount = notifications.filter(item => !item.read_at).length

  const changePage = nextPage => {
    setSearchParams(nextPage > 1 ? { page: String(nextPage) } : {}, { replace: true })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const openNotification = async item => {
    if (!item.read_at) await markRead(item.id).catch(() => {})
    if (item.related_complaint_id) navigate(`/complaints/${item.related_complaint_id}`)
  }

  const dismissNotification = async item => {
    await dismiss(item.id)
    if (notifications.length === 1 && page > 1) changePage(page - 1)
  }

  if (loading && notifications.length === 0) return <PageLoader label="Loading notifications…" />

  return (
    <div className="space-y-5">
      <div className="page-band wave-header page-header">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <p className="text-gold-400 text-xs font-bold uppercase tracking-[.15em]">Account</p>
            <h1 className="font-display font-black text-white text-2xl sm:text-3xl mt-1">Notifications</h1>
            <p className="text-navy-300 text-sm mt-1">See complaint updates, assignments, replies, and other items that may need your attention.</p>
          </div>
          <div className="text-right"><p className="font-display font-black text-5xl text-gold-400 leading-none">{unreadCount}</p><p className="text-navy-300 text-xs uppercase">unread</p></div>
        </div>
      </div>

      {error ? <ErrorBanner message={error} onRetry={() => fetchNotifications(page)} /> : null}
      {notifications.length > 0 ? (
        <section className="qol-filter-bar card space-y-3 rounded-xl p-4" aria-label="Notification filters">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              {[
                ['action', 'Action needed', actionCount],
                ['unread', 'Unread', pageUnreadCount],
                ['all', 'All updates', notifications.length],
              ].map(([value, label, count]) => <button key={value} type="button" aria-pressed={view === value} onClick={() => setView(value)} className={`filter-chip inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-bold ${view === value ? 'border-navy-800 bg-navy-800 text-white' : 'border-gray-200 bg-white text-gray-600'}`}>{label}<span className={`rounded-full px-2 py-0.5 text-xs font-black ${view === value ? 'bg-white/15 text-white' : 'bg-gray-100 text-gray-600'}`}>{count}</span></button>)}
            </div>
            {unreadCount > 0 ? <button onClick={markAllRead} className="btn-secondary rounded-lg text-sm">Mark all read</button> : null}
          </div>
          <SearchField value={query} onChange={event => setQuery(event.target.value)} onClear={() => setQuery('')} placeholder="Search notification titles and messages" />
          <p className="text-xs text-gray-500">Filters apply to the notifications loaded on this page.</p>
        </section>
      ) : null}

      {notifications.length === 0 ? (
        <EmptyState
          icon={<AppIcon name="bell" className="h-10 w-10" />}
          title="You’re all caught up"
          description="New notifications will appear here."
        />
      ) : visibleNotifications.length === 0 ? (
        <EmptyState
          icon={<AppIcon name={view === 'action' ? 'check' : 'search'} className="h-10 w-10" />}
          title={view === 'action' ? 'No action-needed notifications' : 'No notifications match this view'}
          description={view === 'action' ? 'Updates that only need your attention will remain under All updates.' : 'Try another filter or clear the search.'}
        />
      ) : (
        <>
          <div className="card rounded-xl overflow-hidden divide-y divide-gray-100">
            {visibleNotifications.map(item => (
              <article key={item.id} className={`notification-row flex gap-3 p-4 sm:p-5 ${item.read_at ? '' : 'notification-row--unread'}`}>
                <button type="button" onClick={() => openNotification(item)} className="min-w-0 flex flex-1 gap-3 text-left sm:gap-4">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${item.read_at ? 'bg-gray-100 text-gray-500' : 'bg-navy-800 text-white'}`}>
                    <AppIcon name={ICONS[item.notification_type] || 'info'} className="w-5 h-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-3"><div className="flex min-w-0 flex-wrap items-center gap-2"><p className="font-bold text-gray-900">{item.title}</p>{needsAction(item) ? <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-black text-amber-800">Action needed</span> : null}</div><span className="shrink-0 text-xs text-gray-500 sm:whitespace-nowrap">{formatDate(item.created_at)}</span></div>
                    <p className="text-sm text-gray-600 mt-1 leading-relaxed">{item.message}</p>
                    {item.related_complaint_id ? <p className="text-xs font-bold text-brand-700 mt-2">{actionLabel(item)}</p> : null}
                  </div>
                  {!item.read_at ? <span className="w-2 h-2 rounded-full bg-brand-500 mt-2 shrink-0" aria-label="Unread" /> : null}
                </button>
                <button type="button" onClick={() => dismissNotification(item)} className="flex h-11 w-11 shrink-0 items-center justify-center self-start rounded-full p-0 text-gray-500 hover:bg-red-50 hover:text-red-600" aria-label={`Dismiss notification: ${item.title}`}>
                  <span aria-hidden="true">×</span>
                </button>
              </article>
            ))}
          </div>
          <Pagination page={page} pageSize={pageSize} total={total} onPageChange={changePage} label="notifications" />
        </>
      )}
    </div>
  )
}
