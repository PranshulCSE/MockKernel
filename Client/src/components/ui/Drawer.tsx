import React, { useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X } from 'lucide-react'
import { cn } from '../../lib/cn'

export interface DrawerProps {
  isOpen: boolean
  onClose: () => void
  title?: React.ReactNode
  description?: React.ReactNode
  children: React.ReactNode
  footer?: React.ReactNode
  position?: 'right' | 'left'
  width?: 'sm' | 'md' | 'lg' | 'xl' | 'full'
  closeOnBackdropClick?: boolean
  showCloseButton?: boolean
  className?: string
}

const widthClasses = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-3xl',
  full: 'max-w-full',
}

export function Drawer({
  isOpen,
  onClose,
  title,
  description,
  children,
  footer,
  position = 'right',
  width = 'md',
  closeOnBackdropClick = true,
  showCloseButton = true,
  className,
}: DrawerProps) {
  const drawerRef = useRef<HTMLDivElement>(null)
  const previousActiveElement = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!isOpen) return

    previousActiveElement.current = document.activeElement as HTMLElement
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
        return
      }

      if (e.key === 'Tab') {
        if (!drawerRef.current) return
        const focusableElements = drawerRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        )
        if (focusableElements.length === 0) return

        const firstElement = focusableElements[0]
        const lastElement = focusableElements[focusableElements.length - 1]

        if (e.shiftKey) {
          if (document.activeElement === firstElement) {
            e.preventDefault()
            lastElement.focus()
          }
        } else {
          if (document.activeElement === lastElement) {
            e.preventDefault()
            firstElement.focus()
          }
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    const timer = setTimeout(() => {
      if (drawerRef.current) {
        const firstInput = drawerRef.current.querySelector<HTMLElement>(
          'input, textarea, select, button:not([aria-label="Close drawer"])',
        )
        if (firstInput) {
          firstInput.focus()
        } else {
          drawerRef.current.focus()
        }
      }
    }, 50)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = originalOverflow
      clearTimeout(timer)
      if (previousActiveElement.current && typeof previousActiveElement.current.focus === 'function') {
        previousActiveElement.current.focus()
      }
    }
  }, [isOpen, onClose])

  const slideDirection = position === 'right' ? { x: '100%' } : { x: '-100%' }

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex overflow-hidden">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={closeOnBackdropClick ? onClose : undefined}
            className="fixed inset-0 bg-base/80 backdrop-blur-md"
            aria-hidden="true"
          />

          {/* Drawer Container */}
          <div
            className={cn(
              'fixed inset-y-0 flex max-w-full pointer-events-none',
              position === 'right' ? 'right-0 pl-10' : 'left-0 pr-10',
            )}
          >
            <motion.div
              ref={drawerRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby={title ? 'drawer-title' : undefined}
              aria-describedby={description ? 'drawer-desc' : undefined}
              tabIndex={-1}
              initial={slideDirection}
              animate={{ x: 0 }}
              exit={slideDirection}
              transition={{ type: 'spring', damping: 28, stiffness: 300 }}
              className={cn(
                'pointer-events-auto flex w-screen flex-col border-white/10 bg-base/95 shadow-2xl backdrop-blur-2xl',
                position === 'right' ? 'border-l' : 'border-r',
                widthClasses[width],
                className,
              )}
            >
              {/* Header */}
              {(title || showCloseButton) && (
                <div className="flex items-start justify-between gap-4 border-b border-white/10 px-6 py-5 shrink-0">
                  <div>
                    {title && (
                      <h3 id="drawer-title" className="font-display text-lg font-bold text-ink sm:text-xl">
                        {title}
                      </h3>
                    )}
                    {description && (
                      <p id="drawer-desc" className="mt-1 font-sans text-xs text-muted leading-relaxed">
                        {description}
                      </p>
                    )}
                  </div>
                  {showCloseButton && (
                    <button
                      type="button"
                      aria-label="Close drawer"
                      onClick={onClose}
                      className="shrink-0 rounded-ctl p-1.5 text-muted hover:text-ink hover:bg-white/10 transition-colors"
                    >
                      <X className="size-5" />
                    </button>
                  )}
                </div>
              )}

              {/* Body */}
              <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>

              {/* Footer */}
              {footer && (
                <div className="flex flex-wrap items-center justify-end gap-3 border-t border-white/10 px-6 py-4 bg-white/[0.02] shrink-0">
                  {footer}
                </div>
              )}
            </motion.div>
          </div>
        </div>
      )}
    </AnimatePresence>
  )
}
