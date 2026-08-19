import { create } from 'zustand'

let nextId = 1

export const useToastStore = create((set) => ({
  toasts: [],
  push: (message, tone = 'success', options = {}) => {
    const id = nextId++
    const toast = { id, message, tone, title: options.title || '', duration: options.duration ?? 3200 }
    set(state => ({ toasts: [...state.toasts, toast].slice(-4) }))
    if (toast.duration > 0) {
      window.setTimeout(() => set(state => ({ toasts: state.toasts.filter(item => item.id !== id) })), toast.duration)
    }
    return id
  },
  dismiss: id => set(state => ({ toasts: state.toasts.filter(item => item.id !== id) })),
  clear: () => set({ toasts: [] }),
}))
