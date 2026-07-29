import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAnnouncementStore } from '../../store/announcementStore'
import AppIcon from './AppIcon'

const DISMISS_KEY = 'mrwd_dismissed_interruption'

export default function CustomerInterruptionBanner() {
  const navigate = useNavigate()
  const announcements = useAnnouncementStore(state => state.announcements)
  const fetchAnnouncements = useAnnouncementStore(state => state.fetchAnnouncements)
  const [dismissedId, setDismissedId] = useState(() => sessionStorage.getItem(DISMISS_KEY))

  useEffect(() => {
    fetchAnnouncements()
  }, [fetchAnnouncements])

  const interruption = useMemo(() => announcements
    .filter(item => item.category === 'interruption' && !item.is_expired)
    .sort((a, b) =>
      Number(Boolean(b.is_important)) - Number(Boolean(a.is_important)) ||
      new Date(b.created_at) - new Date(a.created_at))[0], [announcements])

  if (!interruption || interruption.id === dismissedId) return null

  const dismiss = () => {
    sessionStorage.setItem(DISMISS_KEY, interruption.id)
    setDismissedId(interruption.id)
  }

  return (
    <aside className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-red-900" aria-label="Active service interruption">
      <div className="flex items-start gap-3">
        <AppIcon name="alert" className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-black uppercase tracking-widest text-red-600">Active Service Interruption</p>
          <p className="mt-1 font-display font-bold">{interruption.title}</p>
          <p className="mt-1 line-clamp-2 text-sm text-red-800">{interruption.content}</p>
          <button type="button" onClick={() => navigate('/customer/announcements')} className="mt-2 text-xs font-black text-red-800 underline underline-offset-2">
            Read full advisory
          </button>
        </div>
        <button type="button" onClick={dismiss} className="rounded-lg p-1 text-red-500 hover:bg-red-100" aria-label="Dismiss service interruption banner">
          <AppIcon name="close" className="h-4 w-4" />
        </button>
      </div>
    </aside>
  )
}
