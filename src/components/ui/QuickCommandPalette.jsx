import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useProductionStore } from '../../store/productionStore'
import AppIcon from './AppIcon'

export default function QuickCommandPalette({ onClose, navItems = [] }) {
  const navigate = useNavigate()
  const globalSearch = useProductionStore(state => state.globalSearch)
  const loadRecent = useProductionStore(state => state.loadRecent)
  const recent = useProductionStore(state => state.recent)
  const [query, setQuery] = useState('')
  const [remote, setRemote] = useState([])
  const [activeIndex, setActiveIndex] = useState(0)
  const [searching, setSearching] = useState(false)
  const inputRef = useRef(null)

  useEffect(() => {
    loadRecent().catch(() => {})
    const timer = window.setTimeout(() => inputRef.current?.focus(), 20)
    return () => window.clearTimeout(timer)
  }, [loadRecent])

  useEffect(() => {
    const trimmed = query.trim()
    if (trimmed.length < 2) return undefined

    let active = true
    const timer = window.setTimeout(async () => {
      setSearching(true)
      try {
        const result = await globalSearch(trimmed)
        if (!active) return
        setRemote([
          ...(result.complaints || []).map(complaint => ({
            type: 'complaint',
            key: `complaint:${complaint.id}`,
            label: complaint.complaint_type || 'Complaint',
            meta: `${complaint.reference_number || 'Complaint'}${complaint.customer_name ? ` · ${complaint.customer_name}` : ''}`,
            to: `/complaints/${complaint.id}`,
          })),
          ...(result.staff || []).map(person => ({
            type: 'staff',
            key: `staff:${person.id}`,
            label: person.full_name,
            meta: `${person.email} · Staff account`,
            to: `/system/staff-accounts?q=${encodeURIComponent(person.email)}`,
          })),
        ])
      } catch {
        if (active) setRemote([])
      } finally {
        if (active) setSearching(false)
      }
    }, 220)

    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [query, globalSearch])

  const results = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    const navigation = navItems
      .filter(item => !normalized || `${item.section || ''} ${item.label}`.toLowerCase().includes(normalized))
      .slice(0, normalized ? 5 : 8)
      .map(item => ({ type: 'page', key: `page:${item.to}`, label: item.label, meta: item.section || 'Page', to: item.to, icon: item.icon }))

    if (normalized) return [...remote, ...navigation].slice(0, 12)

    const recentComplaints = (recent || []).slice(0, 5).map(complaint => ({
      type: 'complaint',
      key: `recent:${complaint.id}`,
      label: complaint.complaint_type || 'Complaint',
      meta: `Recently viewed · ${complaint.reference_number || ''}`,
      to: `/complaints/${complaint.id}`,
    }))
    return [...navigation, ...recentComplaints].slice(0, 12)
  }, [navItems, query, remote, recent])

  const currentIndex = Math.min(activeIndex, Math.max(results.length - 1, 0))
  const go = item => {
    if (!item) return
    navigate(item.to)
    onClose()
  }
  const handleQueryChange = event => {
    const value = event.target.value
    setQuery(value)
    setActiveIndex(0)
    if (value.trim().length < 2) {
      setRemote([])
      setSearching(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center bg-navy-950/55 px-3 pt-[10vh] backdrop-blur-sm" onMouseDown={onClose}>
      <div className="w-full max-w-2xl overflow-hidden rounded-2xl border border-white/20 bg-white shadow-2xl" onMouseDown={event => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="Quick Find">
        <div className="flex items-center gap-3 border-b border-gray-100 px-4 py-3">
          <AppIcon name="search" className="h-5 w-5 shrink-0 text-navy-600" />
          <input
            ref={inputRef}
            value={query}
            onChange={handleQueryChange}
            onKeyDown={event => {
              if (event.key === 'ArrowDown') { event.preventDefault(); setActiveIndex(value => Math.min(value + 1, Math.max(results.length - 1, 0))) }
              if (event.key === 'ArrowUp') { event.preventDefault(); setActiveIndex(value => Math.max(value - 1, 0)) }
              if (event.key === 'Enter') { event.preventDefault(); go(results[currentIndex]) }
              if (event.key === 'Escape') onClose()
            }}
            className="min-w-0 flex-1 border-0 bg-transparent py-2 text-base font-semibold outline-none"
            placeholder="Search reference, account number, customer, address, staff…"
          />
          <span className="text-xs font-bold text-gray-500">{searching ? 'SEARCHING…' : 'ESC'}</span>
        </div>
        <div className="max-h-[56vh] overflow-y-auto p-2">
          {results.length ? results.map((item, index) => {
            const Icon = item.icon
            return (
              <button type="button" key={item.key} onMouseEnter={() => setActiveIndex(index)} onClick={() => go(item)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left ${index === currentIndex ? 'bg-navy-50 text-navy-950' : 'text-gray-700 hover:bg-gray-50'}`}>
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${item.type === 'complaint' ? 'bg-gold-100 text-gold-700' : item.type === 'staff' ? 'bg-green-100 text-green-700' : 'bg-navy-100 text-navy-700'}`}>
                  {Icon ? <Icon className="h-4 w-4" /> : <AppIcon name={item.type === 'staff' ? 'user' : 'document'} className="h-4 w-4" />}
                </span>
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-black">{item.label}</span><span className="block truncate text-xs text-gray-500">{item.meta}</span></span>
                <span className="text-xs text-gray-300">↵</span>
              </button>
            )
          }) : <div className="px-4 py-10 text-center text-sm text-gray-500">No matches found.</div>}
        </div>
        <div className="flex justify-between gap-2 border-t bg-gray-50 px-4 py-2.5 text-xs font-semibold text-gray-500"><span>↑↓ navigate · Enter open</span><span>Recent complaints appear when search is empty</span></div>
      </div>
    </div>
  )
}
