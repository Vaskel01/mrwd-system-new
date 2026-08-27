import { create } from 'zustand'
import { apiFetch } from '../lib/api'

export const useOperationalStore = create((set, get) => ({
  workload: [],
  incidents: [],
  reasonCodes: [],
  loading: false,
  error: null,

  fetchOperationalReference: async () => {
    set({ loading: true, error: null })
    try {
      const [reasons, incidents] = await Promise.all([
        apiFetch('/workflow/reason-codes'),
        apiFetch('/workflow/incidents'),
      ])
      set({ reasonCodes: reasons.reason_codes || [], incidents: incidents.incidents || [], loading: false })
    } catch (error) {
      set({ error: error.message, loading: false })
    }
  },

  fetchWorkload: async () => {
    try {
      const { workload } = await apiFetch('/workflow/ecmd/workload')
      set({ workload: workload || [] })
      return workload || []
    } catch (error) {
      set({ error: error.message })
      return []
    }
  },

  fetchComplaintContext: complaintId => apiFetch(`/workflow/complaints/${complaintId}/context`),

  addInternalNote: async (complaintId, note) => {
    const result = await apiFetch(`/workflow/complaints/${complaintId}/notes`, { method: 'POST', body: JSON.stringify({ note }) })
    return result.note
  },

  logCustomerContact: async (complaintId, data) => {
    const result = await apiFetch(`/workflow/complaints/${complaintId}/contact-log`, { method: 'POST', body: JSON.stringify(data) })
    return result.contact
  },

  linkComplaint: async (complaintId, data) => {
    const result = await apiFetch(`/workflow/complaints/${complaintId}/relations`, { method: 'POST', body: JSON.stringify(data) })
    return result.relation
  },

  createIncident: async data => {
    const { incident } = await apiFetch('/workflow/incidents', { method: 'POST', body: JSON.stringify(data) })
    set(state => ({ incidents: [incident, ...state.incidents] }))
    return incident
  },

  addIncidentMember: async (incidentId, complaintId) => {
    await apiFetch(`/workflow/incidents/${incidentId}/members`, { method: 'POST', body: JSON.stringify({ complaint_id: complaintId }) })
    await get().fetchOperationalReference()
  },

  setIncidentStatus: async (incidentId, status) => {
    const { incident } = await apiFetch(`/workflow/incidents/${incidentId}`, { method: 'PATCH', body: JSON.stringify({ status }) })
    set(state => ({ incidents: state.incidents.map(item => item.id === incidentId ? incident : item) }))
    return incident
  },
}))
