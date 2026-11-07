import { useId, type InputHTMLAttributes, type ReactNode } from 'react'
import { cn } from '../../lib/cn'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  error?: string
  hint?: string
  leftIcon?: ReactNode
  rightSlot?: ReactNode
}

export function Input({
  label,
  error,
  hint,
  leftIcon,
  rightSlot,
  className,
  id,
  ...rest
}: InputProps) {
  const autoId = useId()
  const inputId = id ?? autoId
  const messageId = `${inputId}-msg`
  const message = error ?? hint

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={inputId} className="text-sm font-medium text-ink">
        {label}
      </label>
      <div className="relative">
        {leftIcon && (
          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted">
            {leftIcon}
          </span>
        )}
        <input
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={message ? messageId : undefined}
          className={cn(
            'h-11 w-full rounded-ctl border bg-white/5 text-sm text-ink placeholder:text-muted/70',
            'backdrop-blur-xl transition-colors duration-200',
            'focus-visible:border-cyan/60 focus-visible:ring-1 focus-visible:ring-cyan/60 focus-visible:ring-offset-0',
            leftIcon ? 'pl-10' : 'pl-4',
            rightSlot ? 'pr-11' : 'pr-4',
            error ? 'border-bad/70' : 'border-white/10 hover:border-white/20',
          )}
          {...rest}
        />
        {rightSlot && (
          <span className="absolute right-2 top-1/2 -translate-y-1/2">{rightSlot}</span>
        )}
      </div>
      {message && (
        <p
          id={messageId}
          role={error ? 'alert' : undefined}
          className={cn('text-xs', error ? 'text-bad' : 'text-muted')}
        >
          {message}
        </p>
      )}
    </div>
  )
}
