import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useProductionStore } from '../../store/productionStore'
import AppIcon from './AppIcon'

export default function QuickCommandPalette({ open, onClose, navItems = [] }) {
  const navigate = useNavigate()
  const globalSearch = useProductionStore(s => s.globalSearch)
  const loadRecent = useProductionStore(s => s.loadRecent)
  const recent = useProductionStore(s => s.recent)
  const [query, setQuery] = useState('')
  const [remote, setRemote] = useState([])
  const [activeIndex, setActiveIndex] = useState(0)
  const [searching, setSearching] = useState(false)
  const inputRef = useRef(null)

  useEffect(() => { if (!open) return; setQuery(''); setRemote([]); setActiveIndex(0); loadRecent().catch(()=>{}); const timer=setTimeout(()=>inputRef.current?.focus(),20); return()=>clearTimeout(timer) }, [open, loadRecent])
  useEffect(() => {
    if (!open || query.trim().length < 2) { setRemote([]); return }
    let active=true; const timer=setTimeout(async()=>{ setSearching(true); try { const result=await globalSearch(query.trim()); if(active) setRemote([...(result.complaints||[]).map(c=>({ type:'complaint', key:`complaint:${c.id}`, label:c.complaint_type||'Complaint', meta:`${c.reference_number||'Complaint'}${c.customer_name?` · ${c.customer_name}`:''}`, to:`/complaints/${c.id}` })), ...(result.staff||[]).map(p=>({ type:'staff', key:`staff:${p.id}`, label:p.full_name, meta:`${p.email} · Staff account`, to:`/system/staff-accounts?q=${encodeURIComponent(p.email)}` }))]) } catch { if(active) setRemote([]) } finally { if(active) setSearching(false) } },220); return()=>{active=false;clearTimeout(timer)}
  }, [open, query, globalSearch])

  const results=useMemo(()=>{ const q=query.trim().toLowerCase(); const nav=navItems.filter(i=>!q||`${i.section||''} ${i.label}`.toLowerCase().includes(q)).slice(0,q?5:8).map(i=>({ type:'page',key:`page:${i.to}`,label:i.label,meta:i.section||'Page',to:i.to,icon:i.icon })); if(q) return [...remote,...nav].slice(0,12); const r=(recent||[]).slice(0,5).map(c=>({type:'complaint',key:`recent:${c.id}`,label:c.complaint_type||'Complaint',meta:`Recently viewed · ${c.reference_number||''}`,to:`/complaints/${c.id}`})); return [...nav,...r].slice(0,12) },[navItems,query,remote,recent])
  useEffect(()=>{ if(activeIndex>=results.length)setActiveIndex(0)},[results.length,activeIndex])
  const go=item=>{ if(!item)return;navigate(item.to);onClose() }
  if(!open)return null
  return <div className="fixed inset-0 z-[80] flex items-start justify-center bg-navy-950/55 px-3 pt-[10vh] backdrop-blur-sm" onMouseDown={onClose}><div className="w-full max-w-2xl overflow-hidden rounded-2xl border border-white/20 bg-white shadow-2xl" onMouseDown={e=>e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Quick Find">
    <div className="flex items-center gap-3 border-b border-gray-100 px-4 py-3"><AppIcon name="search" className="h-5 w-5 shrink-0 text-navy-600"/><input ref={inputRef} value={query} onChange={e=>{setQuery(e.target.value);setActiveIndex(0)}} onKeyDown={e=>{if(e.key==='ArrowDown'){e.preventDefault();setActiveIndex(v=>Math.min(v+1,Math.max(results.length-1,0)))}if(e.key==='ArrowUp'){e.preventDefault();setActiveIndex(v=>Math.max(v-1,0))}if(e.key==='Enter'){e.preventDefault();go(results[activeIndex])}if(e.key==='Escape')onClose()}} className="min-w-0 flex-1 border-0 bg-transparent py-2 text-base font-semibold outline-none" placeholder="Search reference, account number, customer, address, staff…"/><span className="text-[10px] font-bold text-gray-400">{searching?'SEARCHING…':'ESC'}</span></div>
    <div className="max-h-[56vh] overflow-y-auto p-2">{results.length?results.map((item,index)=>{const Icon=item.icon;return <button type="button" key={item.key} onMouseEnter={()=>setActiveIndex(index)} onClick={()=>go(item)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left ${index===activeIndex?'bg-navy-50 text-navy-950':'text-gray-700 hover:bg-gray-50'}`}><span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${item.type==='complaint'?'bg-gold-100 text-gold-700':item.type==='staff'?'bg-green-100 text-green-700':'bg-navy-100 text-navy-700'}`}>{Icon?<Icon className="h-4 w-4"/>:<AppIcon name={item.type==='staff'?'user':'document'} className="h-4 w-4"/>}</span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-black">{item.label}</span><span className="block truncate text-[11px] text-gray-400">{item.meta}</span></span><span className="text-xs text-gray-300">↵</span></button>}):<div className="px-4 py-10 text-center text-sm text-gray-400">No matches found.</div>}</div>
    <div className="flex justify-between gap-2 border-t bg-gray-50 px-4 py-2.5 text-[10px] font-semibold text-gray-400"><span>↑↓ navigate · Enter open</span><span>Recent complaints appear when search is empty</span></div>
  </div></div>
}
