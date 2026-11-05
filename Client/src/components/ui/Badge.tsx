import type { HTMLAttributes } from 'react'
import { cn } from '../../lib/cn'

type Tone = 'neutral' | 'ok' | 'warn' | 'bad' | 'run' | 'flag'

const tones: Record<Tone, string> = {
  neutral: 'border-white/10 bg-white/5 text-muted',
  ok: 'border-ok/40 bg-ok/10 text-ok',
  warn: 'border-warn/40 bg-warn/10 text-warn',
  bad: 'border-bad/40 bg-bad/10 text-bad',
  run: 'border-run/40 bg-run/10 text-run',
  flag: 'border-flag/40 bg-flag/10 text-flag',
}

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone
}

export function Badge({ tone = 'neutral', className, ...rest }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium',
        tones[tone],
        className,
      )}
      {...rest}
    />
  )
}
