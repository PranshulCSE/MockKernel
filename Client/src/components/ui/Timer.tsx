import { useState, useEffect, useMemo } from 'react'
import { Clock, AlertTriangle } from 'lucide-react'
import { cn } from '../../lib/cn'

export interface TimerProps {
  /** Target timestamp (ISO string, Date object, or milliseconds) when the contest ends */
  targetTime?: string | Date | number
  /** Or directly pass initial seconds remaining */
  initialSeconds?: number
  /** Callback fired when timer reaches zero */
  onExpire?: () => void
  /** Size variant */
  size?: 'sm' | 'md' | 'lg'
  /** Custom class names */
  className?: string
  /** Whether to show a clock icon */
  showIcon?: boolean
}

export function Timer({
  targetTime,
  initialSeconds,
  onExpire,
  size = 'md',
  className,
  showIcon = true,
}: TimerProps) {
  const calculateRemainingSeconds = (): number => {
    if (targetTime !== undefined) {
      const targetMs = new Date(targetTime).getTime()
      const nowMs = Date.now()
      return Math.max(0, Math.floor((targetMs - nowMs) / 1000))
    }
    if (initialSeconds !== undefined) {
      return Math.max(0, initialSeconds)
    }
    return 0
  }

  const [secondsLeft, setSecondsLeft] = useState<number>(calculateRemainingSeconds)

  useEffect(() => {
    // Reset if targetTime changes
    setSecondsLeft(calculateRemainingSeconds())

    const interval = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval)
          if (onExpire) onExpire()
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(interval)
  }, [targetTime, initialSeconds])

  // Warning state when less than 5 minutes remain (300 seconds)
  const isUrgent = secondsLeft > 0 && secondsLeft < 300
  const isExpired = secondsLeft === 0

  const formattedTime = useMemo(() => {
    const hours = Math.floor(secondsLeft / 3600)
    const minutes = Math.floor((secondsLeft % 3600) / 60)
    const seconds = secondsLeft % 60

    const pad = (n: number) => String(n).padStart(2, '0')

    if (hours > 0) {
      return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
    }
    return `${pad(minutes)}:${pad(seconds)}`
  }, [secondsLeft])

  const sizeClasses = {
    sm: 'text-xs px-2.5 py-1 gap-1.5',
    md: 'text-sm px-3.5 py-1.5 gap-2',
    lg: 'text-xl px-5 py-2.5 gap-3 font-semibold',
  }[size]

  return (
    <div
      role="timer"
      aria-label={`Time remaining: ${formattedTime}`}
      className={cn(
        'inline-flex items-center font-mono rounded-ctl transition-all select-none border',
        sizeClasses,
        isExpired
          ? 'bg-bad/10 text-bad border-bad/30'
          : isUrgent
            ? 'bg-warn/15 text-warn border-warn/40 animate-pulse shadow-[0_0_16px_rgba(251,191,36,0.25)]'
            : 'bg-white/5 text-ink border-white/10 backdrop-blur-md',
        className
      )}
    >
      {showIcon && (
        isUrgent ? (
          <AlertTriangle className={cn('shrink-0 text-warn', size === 'lg' ? 'size-5' : 'size-4')} />
        ) : (
          <Clock className={cn('shrink-0 text-muted', size === 'lg' ? 'size-5' : 'size-4')} />
        )
      )}
      <span className="tracking-wider">{isExpired ? '00:00:00' : formattedTime}</span>
    </div>
  )
}
