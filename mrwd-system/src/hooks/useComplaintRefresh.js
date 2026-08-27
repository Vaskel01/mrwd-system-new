import { useCallback, useEffect, useRef, useState } from 'react'
import { apiFetch } from '../lib/api'

function listSignature(items = []) {
  return items
    .map(item => `${item.id}:${item.updated_at || item.created_at}:${item.status}`)
    .sort()
    .join('|')
}

export function useComplaintListRefresh(complaints, refresh, intervalMs = 60000) {
  const signatureRef = useRef(listSignature(complaints))
  const [updatesAvailable, setUpdatesAvailable] = useState(false)

  useEffect(() => {
    signatureRef.current = listSignature(complaints)
  }, [complaints])

  useEffect(() => {
    const check = async () => {
      if (document.hidden || !navigator.onLine) return
      try {
        const result = await apiFetch('/complaints')
        if (listSignature(result.complaints || []) !== signatureRef.current) setUpdatesAvailable(true)
      } catch {
        // Existing page data remains usable when a background check fails.
      }
    }
    const onFocus = () => check()
    const onVisibility = () => { if (!document.hidden) check() }
    const timer = window.setInterval(check, intervalMs)
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [intervalMs])

  const refreshNow = useCallback(async () => {
    await refresh()
    setUpdatesAvailable(false)
  }, [refresh])

  return { updatesAvailable, refreshNow }
}

export function useComplaintDetailRefresh(complaintId, complaint, refresh, intervalMs = 60000) {
  const versionRef = useRef(`${complaint?.updated_at || complaint?.created_at || ''}:${complaint?.status || ''}`)
  const [updatesAvailable, setUpdatesAvailable] = useState(false)

  useEffect(() => {
    versionRef.current = `${complaint?.updated_at || complaint?.created_at || ''}:${complaint?.status || ''}`
  }, [complaint?.updated_at, complaint?.created_at, complaint?.status])

  useEffect(() => {
    if (!complaintId) return undefined
    const check = async () => {
      if (document.hidden || !navigator.onLine) return
      try {
        const result = await apiFetch(`/complaints/${complaintId}`)
        const latest = result.complaint
        const latestVersion = `${latest?.updated_at || latest?.created_at || ''}:${latest?.status || ''}`
        if (latestVersion !== versionRef.current) setUpdatesAvailable(true)
      } catch {
        // Existing page data remains usable when a background check fails.
      }
    }
    const onFocus = () => check()
    const onVisibility = () => { if (!document.hidden) check() }
    const timer = window.setInterval(check, intervalMs)
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [complaintId, intervalMs])

  const refreshNow = useCallback(async () => {
    await refresh(complaintId)
    setUpdatesAvailable(false)
  }, [complaintId, refresh])

  return { updatesAvailable, refreshNow }
}
