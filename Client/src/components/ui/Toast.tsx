import React, { createContext, useContext, useState, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle2, AlertTriangle, AlertCircle, Info, X } from 'lucide-react'
import { cn } from '../../lib/cn'

export type ToastType = 'success' | 'error' | 'warn' | 'info'

export interface ToastItem {
  id: string
  title?: string
  message: string
  type: ToastType
  duration?: number
}

interface ToastContextValue {
  toasts: ToastItem[]
  addToast: (toast: Omit<ToastItem, 'id'>) => string
  removeToast: (id: string) => void
  success: (message: string, title?: string) => string
  error: (message: string, title?: string) => string
  warn: (message: string, title?: string) => string
  info: (message: string, title?: string) => string
}

const ToastContext = createContext<ToastContextValue | null>(null)

// Standalone event emitter for non-hook invocations
type ToastListener = (toast: Omit<ToastItem, 'id'>) => void
const toastListeners = new Set<ToastListener>()

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

const icons: Record<ToastType, React.ComponentType<{ className?: string }>> = {
  success: CheckCircle2,
  error: AlertCircle,
  warn: AlertTriangle,
  info: Info,
}

const toneStyles: Record<ToastType, { border: string; iconColor: string; bgTone: string }> = {
  success: {
    border: 'border-ok/30',
    iconColor: 'text-ok',
    bgTone: 'from-ok/10 to-transparent',
  },
  error: {
    border: 'border-bad/30',
    iconColor: 'text-bad',
    bgTone: 'from-bad/10 to-transparent',
  },
  warn: {
    border: 'border-warn/30',
    iconColor: 'text-warn',
    bgTone: 'from-warn/10 to-transparent',
  },
  info: {
    border: 'border-cyan/30',
    iconColor: 'text-cyan',
    bgTone: 'from-cyan/10 to-transparent',
  },
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const addToast = useCallback(
    (item: Omit<ToastItem, 'id'>) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
      const duration = item.duration ?? 4000
      const newItem: ToastItem = { ...item, id, duration }

      setToasts((prev) => [...prev, newItem])

      if (duration > 0) {
        setTimeout(() => {
          removeToast(id)
        }, duration)
      }

      return id
    },
    [removeToast],
  )

  React.useEffect(() => {
    const listener: ToastListener = (t) => {
      addToast(t)
    }
    toastListeners.add(listener)
    return () => {
      toastListeners.delete(listener)
    }
  }, [addToast])

  const success = useCallback((msg: string, title?: string) => addToast({ type: 'success', message: msg, title }), [addToast])
  const error = useCallback((msg: string, title?: string) => addToast({ type: 'error', message: msg, title }), [addToast])
  const warn = useCallback((msg: string, title?: string) => addToast({ type: 'warn', message: msg, title }), [addToast])
  const info = useCallback((msg: string, title?: string) => addToast({ type: 'info', message: msg, title }), [addToast])

  const value = useMemo(
    () => ({ toasts, addToast, removeToast, success, error, warn, info }),
    [toasts, addToast, removeToast, success, error, warn, info],
  )

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed top-4 right-4 z-50 flex flex-col gap-2.5 max-w-sm w-full"
      >
        <AnimatePresence>
          {toasts.map((t) => {
            const Icon = icons[t.type]
            const style = toneStyles[t.type]
            return (
              <motion.div
                key={t.id}
                role={t.type === 'error' ? 'alert' : 'status'}
                initial={{ opacity: 0, y: -16, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -10, scale: 0.92, transition: { duration: 0.2 } }}
                transition={{ type: 'spring', stiffness: 400, damping: 28 }}
                className={cn(
                  'pointer-events-auto relative flex items-start gap-3 rounded-card p-4 shadow-lg backdrop-blur-xl',
                  'bg-base/90 bg-gradient-to-r border border-white/10',
                  style.bgTone,
                  style.border,
                )}
              >
                <Icon className={cn('size-5 shrink-0 mt-0.5', style.iconColor)} />
                <div className="flex-1 min-w-0 pr-2">
                  {t.title && <h5 className="font-display font-semibold text-sm text-ink">{t.title}</h5>}
                  <p className="font-sans text-xs text-muted leading-relaxed break-words">{t.message}</p>
                </div>
                <button
                  type="button"
                  aria-label="Close notification"
                  onClick={() => removeToast(t.id)}
                  className="shrink-0 rounded-ctl p-1 text-muted hover:text-ink hover:bg-white/10 transition-colors"
                >
                  <X className="size-4" />
                </button>
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  )
}
