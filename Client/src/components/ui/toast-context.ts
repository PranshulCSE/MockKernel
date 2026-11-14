import { createContext, useContext } from 'react'

export type ToastType = 'success' | 'error' | 'warn' | 'info'

export interface ToastItem {
  id: string
  title?: string
  message: string
  type: ToastType
  duration?: number
}

export interface ToastContextValue {
  toasts: ToastItem[]
  addToast: (toast: Omit<ToastItem, 'id'>) => string
  removeToast: (id: string) => void
  success: (message: string, title?: string) => string
  error: (message: string, title?: string) => string
  warn: (message: string, title?: string) => string
  info: (message: string, title?: string) => string
}

export const ToastContext = createContext<ToastContextValue | null>(null)

// Standalone event emitter for non-hook invocations
export type ToastListener = (toast: Omit<ToastItem, 'id'>) => void
export const toastListeners = new Set<ToastListener>()

export const toast = {
  success: (message: string, title?: string) => {
    toastListeners.forEach((fn) => fn({ type: 'success', message, title }))
  },
  error: (message: string, title?: string) => {
    toastListeners.forEach((fn) => fn({ type: 'error', message, title }))
  },
  warn: (message: string, title?: string) => {
    toastListeners.forEach((fn) => fn({ type: 'warn', message, title }))
  },
  info: (message: string, title?: string) => {
    toastListeners.forEach((fn) => fn({ type: 'info', message, title }))
  },
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) {
    throw new Error('useToast must be used within a ToastProvider')
  }
  return ctx
}
