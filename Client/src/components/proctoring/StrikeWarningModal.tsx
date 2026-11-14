import { motion, AnimatePresence } from 'framer-motion'
import { AlertTriangle, ShieldAlert, Maximize2 } from 'lucide-react'
import { Button } from '../ui'

interface StrikeWarningModalProps {
  isOpen: boolean
  strikes: number
  message: string
  onAcknowledge: () => void
}

export function StrikeWarningModal({
  isOpen,
  strikes,
  message,
  onAcknowledge,
}: StrikeWarningModalProps) {
  if (!isOpen) return null

  const isFinalWarning = strikes >= 2

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="relative max-w-lg w-full rounded-2xl border border-bad/40 bg-base/95 p-6 sm:p-8 shadow-2xl shadow-bad/20 text-center"
        >
          {/* Warning Icon with pulsating ring */}
          <div className="relative mx-auto mb-5 flex size-16 items-center justify-center rounded-full bg-bad/15 text-bad">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-bad opacity-20" />
            {isFinalWarning ? (
              <ShieldAlert className="size-8" />
            ) : (
              <AlertTriangle className="size-8" />
            )}
          </div>

          {/* Badge */}
          <div className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wider mb-3 bg-bad/20 text-bad border border-bad/30">
            {isFinalWarning ? 'Final Warning — Strike 2 of 2' : 'Warning — Strike 1 of 2'}
          </div>

          {/* Heading */}
          <h2 className="text-xl sm:text-2xl font-bold font-display text-ink mb-2">
            Proctoring Violation Detected
          </h2>

          {/* Message */}
          <p className="text-sm sm:text-base text-muted mb-6 leading-relaxed">
            {message}
          </p>

          {/* Strikes Graphic */}
          <div className="mb-6 flex justify-center gap-2">
            {[1, 2, 3].map((idx) => {
              const active = idx <= strikes
              return (
                <div
                  key={idx}
                  className={`h-2.5 w-12 rounded-full transition-all duration-300 ${
                    active
                      ? 'bg-bad shadow-glow'
                      : 'bg-white/10'
                  }`}
                />
              )
            })}
          </div>

          {/* Rule Reminder */}
          <div className="rounded-xl border border-white/10 bg-white/5 p-3.5 mb-6 text-xs text-muted text-left space-y-1.5">
            <div className="font-semibold text-ink">Assessment Security Guidelines:</div>
            <ul className="list-disc pl-4 space-y-1">
              <li>Do not leave fullscreen or minimize the browser window.</li>
              <li>Do not switch tabs, inspect devtools, or click onto secondary monitors.</li>
              <li>Remain positioned directly in view of your webcam feed.</li>
              {isFinalWarning && (
                <li className="text-bad font-semibold">
                  NEXT VIOLATION WILL RESULT IN IMMEDIATE AUTO-SUBMISSION.
                </li>
              )}
            </ul>
          </div>

          {/* Acknowledge Button */}
          <Button
            variant="primary"
            className="w-full justify-center gap-2 py-3 text-sm font-semibold bg-bad hover:bg-bad/80 text-white border-none shadow-glow"
            onClick={onAcknowledge}
          >
            <Maximize2 className="size-4" />
            I Understand — Re-enter Fullscreen & Continue
          </Button>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}
