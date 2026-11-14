import React from 'react'
import { Link } from 'react-router'
import type { LucideIcon } from 'lucide-react'
import { cn } from '../../lib/cn'
import { Button } from './Button'

export interface EmptyStateProps {
  icon?: LucideIcon | React.ReactNode
  heading: string
  description: string
  action?: {
    label: string
    onClick?: () => void
    to?: string
    leftIcon?: React.ReactNode
  }
  secondaryAction?: {
    label: string
    onClick?: () => void
    to?: string
  }
  className?: string
}

export function EmptyState({
  icon: IconOrElement,
  heading,
  description,
  action,
  secondaryAction,
  className,
}: EmptyStateProps) {
  const renderIcon = () => {
    if (!IconOrElement) return null
    if (React.isValidElement(IconOrElement)) {
      return IconOrElement
    }
    const IconComponent = IconOrElement as LucideIcon
    return <IconComponent className="size-8 text-cyan" aria-hidden="true" />
  }

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center p-8 sm:p-12 text-center rounded-card',
        'bg-white/5 backdrop-blur-xl border border-white/10',
        className,
      )}
    >
      {IconOrElement && (
        <div className="mb-4 grid size-16 place-items-center rounded-full bg-cyan/10 border border-cyan/20 shadow-glow-cyan/20">
          {renderIcon()}
        </div>
      )}
      <h3 className="font-display text-lg font-bold text-ink sm:text-xl">{heading}</h3>
      <p className="mt-2 max-w-md font-sans text-sm text-muted leading-relaxed">{description}</p>
      {(action || secondaryAction) && (
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          {action && (
            action.to ? (
              <Link to={action.to}>
                <Button variant="primary" leftIcon={action.leftIcon}>
                  {action.label}
                </Button>
              </Link>
            ) : (
              <Button variant="primary" leftIcon={action.leftIcon} onClick={action.onClick}>
                {action.label}
              </Button>
            )
          )}
          {secondaryAction && (
            secondaryAction.to ? (
              <Link to={secondaryAction.to}>
                <Button variant="ghost">{secondaryAction.label}</Button>
              </Link>
            ) : (
              <Button variant="ghost" onClick={secondaryAction.onClick}>
                {secondaryAction.label}
              </Button>
            )
          )}
        </div>
      )}
    </div>
  )
}
