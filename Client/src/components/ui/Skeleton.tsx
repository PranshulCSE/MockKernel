import { cn } from '../../lib/cn'

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  className?: string
  rounded?: 'card' | 'ctl' | 'full' | 'sm' | 'none'
}

export function Skeleton({ className, rounded = 'ctl', style, ...props }: SkeletonProps) {
  const roundedClass = {
    card: 'rounded-card',
    ctl: 'rounded-ctl',
    full: 'rounded-full',
    sm: 'rounded-md',
    none: 'rounded-none',
  }[rounded]

  return (
    <div
      aria-hidden="true"
      className={cn(
        'relative overflow-hidden bg-white/5 border border-white/5',
        'before:absolute before:inset-0 before:-translate-x-full before:animate-[shimmer_1.8s_infinite] before:bg-gradient-to-r before:from-transparent before:via-white/10 before:to-transparent',
        roundedClass,
        className,
      )}
      style={style}
      {...props}
    />
  )
}
