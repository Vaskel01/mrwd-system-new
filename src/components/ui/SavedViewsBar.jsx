import { useEffect, useMemo, useState } from 'react'
import { useProductionStore } from '../../store/productionStore'

export default function SavedViewsBar({ moduleKey, filters, onApply }) {
  const views = useProductionStore(s => s.savedViews)
  const loadSavedViews = useProductionStore(s => s.loadSavedViews)
  const saveView = useProductionStore(s => s.saveView)
  const deleteView = useProductionStore(s => s.deleteView)
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const relevant = useMemo(() => views.filter(v => v.module_key === moduleKey), [views, moduleKey])
  useEffect(() => { loadSavedViews(moduleKey).catch(() => {}) }, [loadSavedViews, moduleKey])
  const create = async () => {
    const value = name.trim(); if (value.length < 2) return
    setSaving(true)
    try { await saveView({ module_key: moduleKey, name: value, filters }); setName('') } finally { setSaving(false) }
  }
  return <div className="flex min-w-0 flex-wrap items-center gap-2 rounded-xl border border-gray-200 bg-white p-2.5">
    <span className="px-1 text-xs font-black uppercase tracking-wider text-gray-500">Saved views</span>
    <select aria-label="Saved view" defaultValue="" onChange={e => { const v = relevant.find(x => x.id === e.target.value); if (v) onApply(v.filters || {}); e.target.value='' }} className="min-h-11 w-full min-w-0 rounded-lg border border-gray-200 bg-white px-2.5 text-xs font-bold text-gray-700 outline-none focus:border-navy-400 sm:w-auto">
      <option value="">Choose a saved view…</option>{relevant.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
    </select>
    <div className="flex w-full min-w-0 flex-1 gap-2 sm:min-w-[220px]"><input value={name} onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); create() } }} placeholder="Name these filters" className="input-field input-field--compact min-w-0 rounded-lg text-xs"/><button type="button" onClick={create} disabled={saving || name.trim().length < 2} className="btn-secondary shrink-0 rounded-lg px-3 py-1.5 text-xs disabled:opacity-40">Save view</button></div>
    {relevant.length > 0 && <details className="relative"><summary className="cursor-pointer list-none rounded-lg px-2 py-2 text-xs font-black text-gray-500 hover:bg-gray-50">Manage views</summary><div className="absolute right-0 z-20 mt-1 w-64 rounded-xl border border-gray-200 bg-white p-2 shadow-xl">{relevant.map(v => <div key={v.id} className="flex items-center justify-between gap-2 rounded-lg px-2 py-2 hover:bg-gray-50"><button type="button" onClick={() => onApply(v.filters || {})} className="min-w-0 flex-1 truncate text-left text-xs font-bold text-gray-700">{v.name}</button><button type="button" onClick={() => deleteView(v.id)} className="shrink-0 text-xs font-black text-red-600">Delete</button></div>)}</div></details>}
  </div>
}
