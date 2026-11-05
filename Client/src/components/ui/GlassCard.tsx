import type { HTMLAttributes } from 'react'
import { cn } from '../../lib/cn'

interface GlassCardProps extends HTMLAttributes<HTMLDivElement> {
  strong?: boolean
  padded?: boolean
}

export function GlassCard({
  strong = false,
  padded = true,
  className,
  ...rest
}: GlassCardProps) {
  return (
    <div
      className={cn(strong ? 'glass-strong' : 'glass', padded && 'p-6', className)}
      {...rest}
    />
  )
}
