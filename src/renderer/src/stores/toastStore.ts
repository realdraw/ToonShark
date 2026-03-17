import {create} from 'zustand'

const TOAST_DURATION_MS = 4000
const TOAST_WITH_ACTION_DURATION_MS = 8000
const MAX_TOASTS = 5

type ToastType = 'success' | 'error' | 'info'

type ToastAction = {
  label: string
  onClick: () => void
}

type Toast = {
  id: number
  type: ToastType
  message: string
  action?: ToastAction
}

type ToastStore = {
  toasts: Toast[]
  addToast: (type: ToastType, message: string, action?: ToastAction) => void
  removeToast: (id: number) => void
}

let nextId = 1
const timers = new Map<number, ReturnType<typeof setTimeout>>()

export const useToastStore = create<ToastStore>((set, get) => ({
  toasts: [],

  addToast: (type, message, action?) => {
    const id = nextId++
    const toast: Toast = { id, type, message, action }

    set((state) => {
      const toasts = [toast, ...state.toasts].slice(0, MAX_TOASTS)
      return { toasts }
    })

    const duration = action ? TOAST_WITH_ACTION_DURATION_MS : TOAST_DURATION_MS
    const timer = setTimeout(() => {
      timers.delete(id)
      get().removeToast(id)
    }, duration)
    timers.set(id, timer)
  },

  removeToast: (id) => {
    const timer = timers.get(id)
    if (timer) {
      clearTimeout(timer)
      timers.delete(id)
    }
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id)
    }))
  }
}))
