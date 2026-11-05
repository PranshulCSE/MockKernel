import type { ButtonHTMLAttributes } from 'react'
import { cn } from '../../lib/cn'

interface ChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  selected: boolean
}

// Toggle chip. aria-pressed exposes the state to screen readers.
export function Chip({ selected, className, ...rest }: ChipProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={cn(
        'rounded-full border px-4 py-1.5 text-sm font-medium transition-colors duration-200',
        selected
          ? 'border-violet/60 bg-violet/20 text-ink shadow-glow'
          : 'border-white/10 bg-white/5 text-muted hover:border-white/20 hover:text-ink',
        className,
      )}
      {...rest}
    />
  )
}
