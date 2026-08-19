import { create } from 'zustand'
import { apiFetch } from '../lib/api'

export const useProductionStore = create((set, get) => ({
  savedViews: [], watched: [], recent: [], templates: [], reportSchedules: [], reportRuns: [],
  loadSavedViews: async moduleKey => {
    const params = moduleKey ? `?module=${encodeURIComponent(moduleKey)}` : ''
    const { views } = await apiFetch(`/production/saved-views${params}`)
    set({ savedViews: views || [] }); return views || []
  },
  saveView: async payload => {
    const { view } = await apiFetch('/production/saved-views', { method: 'POST', body: JSON.stringify(payload) })
    set(state => ({ savedViews: [view, ...state.savedViews] })); return view
  },
  deleteView: async id => { await apiFetch(`/production/saved-views/${id}`, { method: 'DELETE' }); set(state => ({ savedViews: state.savedViews.filter(v => v.id !== id) })) },
  loadWatched: async () => { const { complaints } = await apiFetch('/production/watched-complaints'); set({ watched: complaints || [] }); return complaints || [] },
  setWatch: async (complaintId, watched) => {
    await apiFetch(`/production/complaints/${complaintId}/watch`, { method: watched ? 'PUT' : 'DELETE' })
    if (watched) await get().loadWatched(); else set(state => ({ watched: state.watched.filter(c => c.id !== complaintId) }))
  },
  markRecent: complaintId => apiFetch(`/production/complaints/${complaintId}/recent`, { method: 'POST' }),
  loadRecent: async () => { const { complaints } = await apiFetch('/production/recent-complaints'); set({ recent: complaints || [] }); return complaints || [] },
  globalSearch: q => apiFetch(`/production/search?q=${encodeURIComponent(q)}`),
  mergeComplaint: (complaintId, primaryComplaintId, reason) => apiFetch(`/production/complaints/${complaintId}/merge`, { method: 'POST', body: JSON.stringify({ primary_complaint_id: primaryComplaintId, reason }) }),
  assignmentHistory: complaintId => apiFetch(`/production/complaints/${complaintId}/assignment-history`),
  loadFollowUps: complaintId => apiFetch(`/production/complaints/${complaintId}/follow-ups`),
  requestFollowUp: (complaintId, prompt) => apiFetch(`/production/complaints/${complaintId}/follow-ups`, { method: 'POST', body: JSON.stringify({ prompt }) }),
  respondFollowUp: (id, responseText) => apiFetch(`/production/follow-ups/${id}/respond`, { method: 'POST', body: JSON.stringify({ response_text: responseText }) }),
  bulkAction: (complaintIds, action, extra = {}) => apiFetch('/production/complaints/bulk-action', { method: 'POST', body: JSON.stringify({ complaint_ids: complaintIds, action, ...extra }) }),
  loadTemplates: async () => { const { templates } = await apiFetch('/production/maintenance-note-templates'); set({ templates: templates || [] }); return templates || [] },
  createTemplate: async payload => { const { template } = await apiFetch('/production/maintenance-note-templates', { method: 'POST', body: JSON.stringify(payload) }); set(state => ({ templates: [...state.templates, template].sort((a,b)=>a.label.localeCompare(b.label)) })); return template },
  loadReportSchedules: async () => { const [{ schedules }, { runs }] = await Promise.all([apiFetch('/production/report-schedules'), apiFetch('/production/report-runs')]); set({ reportSchedules: schedules || [], reportRuns: runs || [] }); return { schedules: schedules || [], runs: runs || [] } },
  createReportSchedule: async payload => { const { schedule } = await apiFetch('/production/report-schedules', { method: 'POST', body: JSON.stringify(payload) }); set(state => ({ reportSchedules: [schedule, ...state.reportSchedules] })); return schedule },
  runReportSchedule: async id => { const { run } = await apiFetch(`/production/report-schedules/${id}/run`, { method: 'POST' }); await get().loadReportSchedules(); return run },
  deleteReportSchedule: async id => { await apiFetch(`/production/report-schedules/${id}`, { method: 'DELETE' }); set(state => ({ reportSchedules: state.reportSchedules.filter(s => s.id !== id) })) },
}))
