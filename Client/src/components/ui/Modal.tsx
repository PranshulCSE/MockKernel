import React, { useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X } from 'lucide-react'
import { cn } from '../../lib/cn'

export interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title?: React.ReactNode
  description?: React.ReactNode
  children: React.ReactNode
  footer?: React.ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full'
  closeOnBackdropClick?: boolean
  showCloseButton?: boolean
  className?: string
}

const sizeClasses = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
  full: 'max-w-6xl',
}

export function Modal({
  isOpen,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  closeOnBackdropClick = true,
  showCloseButton = true,
  className,
}: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const previousActiveElement = useRef<HTMLElement | null>(null)

  // Manage focus trap and keyboard listeners
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
        if (!dialogRef.current) return
        const focusableElements = dialogRef.current.querySelectorAll<HTMLElement>(
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

    // Initial focus into modal
    const timer = setTimeout(() => {
      if (dialogRef.current) {
        const firstInput = dialogRef.current.querySelector<HTMLElement>(
          'input, textarea, select, button:not([aria-label="Close modal"])',
        )
        if (firstInput) {
          firstInput.focus()
        } else {
          dialogRef.current.focus()
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

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
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

          {/* Modal Card */}
          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={title ? 'modal-title' : undefined}
            aria-describedby={description ? 'modal-desc' : undefined}
            tabIndex={-1}
            initial={{ opacity: 0, scale: 0.95, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 12 }}
            transition={{ type: 'spring', damping: 25, stiffness: 350 }}
            className={cn(
              'relative w-full overflow-hidden rounded-card border border-white/10 bg-base/95 shadow-2xl backdrop-blur-2xl z-10',
              sizeClasses[size],
              className,
            )}
          >
            {/* Header */}
            {(title || showCloseButton) && (
              <div className="flex items-start justify-between gap-4 border-b border-white/10 px-6 py-5">
                <div>
                  {title && (
                    <h3 id="modal-title" className="font-display text-lg font-bold text-ink sm:text-xl">
                      {title}
                    </h3>
                  )}
                  {description && (
                    <p id="modal-desc" className="mt-1 font-sans text-xs text-muted leading-relaxed">
                      {description}
                    </p>
                  )}
                </div>
                {showCloseButton && (
                  <button
                    type="button"
                    aria-label="Close modal"
                    onClick={onClose}
                    className="shrink-0 rounded-ctl p-1.5 text-muted hover:text-ink hover:bg-white/10 transition-colors"
                  >
                    <X className="size-5" />
                  </button>
                )}
              </div>
            )}

            {/* Content */}
            <div className="px-6 py-5 max-h-[calc(85vh-160px)] overflow-y-auto">{children}</div>

            {/* Footer */}
            {footer && (
              <div className="flex flex-wrap items-center justify-end gap-3 border-t border-white/10 px-6 py-4 bg-white/[0.02]">
                {footer}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
