import { motion, useReducedMotion } from 'framer-motion'
import { Mic, MicOff, Volume2 } from 'lucide-react'
import { cn } from '../../lib/cn'

interface VoiceOrbProps {
  isListening: boolean
  audioLevel?: number // 0 to 1
  isMuted?: boolean
  isThinking?: boolean
  className?: string
  onClick?: () => void
}

export function VoiceOrb({
  isListening,
  audioLevel = 0,
  isMuted = false,
  isThinking = false,
  className,
  onClick,
}: VoiceOrbProps) {
  const shouldReduceMotion = useReducedMotion()

  // Calculate dynamic scale based on audio volume
  const scale = isThinking
    ? 1.05
    : isListening
      ? 1 + Math.min(0.4, audioLevel * 0.6)
      : 1

  return (
    <div
      className={cn('relative grid size-64 place-items-center select-none cursor-pointer', className)}
      onClick={onClick}
      role="button"
      tabIndex={0}
      aria-label={
        isThinking
          ? 'Interviewer is thinking'
          : isListening
            ? 'Listening to your answer. Click to pause'
            : 'Click to start microphone'
      }
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick?.()
        }
      }}
    >
      {/* Outer pulsing acoustic wave rings */}
      {isListening && !shouldReduceMotion && (
        <>
          {[0, 1, 2].map((i) => (
            <motion.span
              key={`wave-${i}`}
              className="absolute inset-0 rounded-full border border-cyan/40 pointer-events-none"
              initial={{ scale: 1, opacity: 0.8 }}
              animate={{
                scale: [1, 1.45 + i * 0.25],
                opacity: [0.6, 0],
              }}
              transition={{
                duration: 2.4,
                repeat: Infinity,
                delay: i * 0.7,
                ease: 'easeOut',
              }}
            />
          ))}
        </>
      )}

      {/* Thinking state amber/violet glow wave */}
      {isThinking && !shouldReduceMotion && (
        <motion.span
          className="absolute inset-0 rounded-full border border-warn/50 pointer-events-none"
          animate={{
            scale: [1, 1.3],
            opacity: [0.7, 0],
          }}
          transition={{
            duration: 1.5,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
      )}

      {/* Secondary blurred glow backdrop */}
      <motion.div
        animate={
          shouldReduceMotion
            ? undefined
            : {
                scale: isListening ? [scale * 0.95, scale * 1.1, scale * 0.95] : 1,
              }
        }
        transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
        className={cn(
          'absolute inset-4 rounded-full blur-2xl transition-all duration-300',
          isThinking
            ? 'bg-warn/30'
            : isListening
              ? 'bg-gradient-to-tr from-violet/50 via-cyan/40 to-pink/40 shadow-glow'
              : 'bg-white/5',
        )}
      />

      {/* Main interactive central orb */}
      <motion.div
        animate={{ scale }}
        transition={{ type: 'spring', stiffness: 300, damping: 20 }}
        className={cn(
          'relative grid size-36 place-items-center rounded-full border transition-all duration-300',
          isThinking
            ? 'bg-gradient-to-tr from-warn/80 to-amber-600 border-warn/40 shadow-[0_0_50px_rgba(251,191,36,.4)]'
            : isListening
              ? 'bg-brand border-cyan/40 shadow-[0_0_60px_rgba(6,182,212,.45)]'
              : 'bg-white/10 border-white/15 hover:bg-white/15 shadow-lg',
        )}
      >
        {isThinking ? (
          <Volume2 className="size-12 text-ink animate-pulse" />
        ) : isMuted ? (
          <MicOff className="size-12 text-bad/90" />
        ) : (
          <Mic
            className={cn(
              'size-12 text-ink transition-transform',
              isListening && 'scale-110 drop-shadow-[0_0_12px_rgba(255,255,255,.8)]',
            )}
          />
        )}
      </motion.div>
    </div>
  )
}
