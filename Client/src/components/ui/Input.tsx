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
    <div className={cn('flex w-full flex-col gap-1.5', className)}>
      <label htmlFor={inputId} className="flex items-center gap-2 text-sm font-medium text-ink">
        {label}
      </label>
      <div
        className={cn(
          'group relative flex items-center rounded-ctl border bg-surface-soft',
          'transition-all duration-200 focus-within:ring-2',
          error
            ? 'border-bad/70 focus-within:border-bad focus-within:ring-bad/20'
            : 'border-line hover:border-cyan/40 focus-within:border-cyan/70 focus-within:ring-cyan/20',
        )}
      >
        {leftIcon && (
          <span
            aria-hidden
            className="pointer-events-none absolute left-3.5 top-1/2 flex size-5 -translate-y-1/2 items-center justify-center text-cyan/80"
          >
            {leftIcon}
          </span>
        )}
        <input
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={message ? messageId : undefined}
          className={cn(
            'h-11 w-full rounded-ctl bg-transparent text-sm text-ink outline-none',
            'placeholder:text-muted/70 focus-visible:ring-0 focus-visible:ring-offset-0',
            leftIcon ? 'pl-11' : 'pl-4',
            rightSlot ? 'pr-12' : 'pr-4',
          )}
          {...rest}
        />
        {rightSlot && (
          <span className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center justify-center text-muted">
            {rightSlot}
          </span>
        )}
      </div>
      {message && (
        <p
          id={messageId}
          role={error ? 'alert' : undefined}
          className={cn('text-xs leading-5', error ? 'text-bad' : 'text-muted')}
        >
          {message}
        </p>
      )}
    </div>
  )
}
