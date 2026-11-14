import React, { useRef } from 'react'
import { motion } from 'framer-motion'
import type { LucideIcon } from 'lucide-react'
import { cn } from '../../lib/cn'

export interface TabItem {
  id: string
  label: string
  icon?: LucideIcon | React.ReactNode
  badge?: string | number
  disabled?: boolean
}

export interface TabsProps {
  tabs: TabItem[]
  activeId: string
  onChange: (id: string) => void
  variant?: 'pill' | 'underline'
  size?: 'sm' | 'md'
  className?: string
  layoutId?: string
}

export function Tabs({
  tabs,
  activeId,
  onChange,
  variant = 'pill',
  size = 'md',
  className,
  layoutId = 'tabs-active-indicator',
}: TabsProps) {
  const listRef = useRef<HTMLDivElement>(null)

  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, currentIndex: number) => {
    let targetIndex = -1
    if (e.key === 'ArrowRight') {
      targetIndex = (currentIndex + 1) % tabs.length
    } else if (e.key === 'ArrowLeft') {
      targetIndex = (currentIndex - 1 + tabs.length) % tabs.length
    } else if (e.key === 'Home') {
      targetIndex = 0
    } else if (e.key === 'End') {
      targetIndex = tabs.length - 1
    }

    if (targetIndex >= 0) {
      e.preventDefault()
      const targetTab = tabs[targetIndex]
      if (!targetTab.disabled) {
        onChange(targetTab.id)
        const buttons = listRef.current?.querySelectorAll<HTMLButtonElement>('button[role="tab"]')
        buttons?.[targetIndex]?.focus()
      }
    }
  }

  const sizeClasses = {
    sm: 'text-xs px-3 py-1.5 gap-1.5',
    md: 'text-sm px-4 py-2 gap-2',
  }[size]

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-orientation="horizontal"
      className={cn(
        'relative flex items-center gap-1 overflow-x-auto no-scrollbar',
        variant === 'pill' && 'rounded-full bg-white/5 p-1 border border-white/10 backdrop-blur-xl',
        variant === 'underline' && 'border-b border-white/10',
        className,
      )}
    >
      {tabs.map((tab, idx) => {
        const isActive = tab.id === activeId
        const renderIcon = () => {
          if (!tab.icon) return null
          if (React.isValidElement(tab.icon)) return tab.icon
          const IconComp = tab.icon as LucideIcon
          return <IconComp className="size-4 shrink-0 opacity-80" aria-hidden="true" />
        }

        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            aria-controls={`tabpanel-${tab.id}`}
            id={`tab-${tab.id}`}
            tabIndex={isActive ? 0 : -1}
            disabled={tab.disabled}
            onClick={() => !tab.disabled && onChange(tab.id)}
            onKeyDown={(e) => handleKeyDown(e, idx)}
            className={cn(
              'relative flex items-center justify-center font-sans font-medium transition-colors shrink-0 outline-none',
              sizeClasses,
              variant === 'pill' && 'rounded-full',
              tab.disabled
                ? 'opacity-40 cursor-not-allowed text-muted'
                : isActive
                  ? 'text-ink'
                  : 'text-muted hover:text-ink hover:bg-white/5',
            )}
          >
            {/* Active animated indicator */}
            {isActive && variant === 'pill' && (
              <motion.div
                layoutId={layoutId}
                transition={{ type: 'spring', stiffness: 450, damping: 32 }}
                className="absolute inset-0 rounded-full bg-brand opacity-90 shadow-glow -z-0"
              />
            )}
            {isActive && variant === 'underline' && (
              <motion.div
                layoutId={layoutId}
                transition={{ type: 'spring', stiffness: 450, damping: 32 }}
                className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-violet to-cyan"
              />
            )}

            <span className="relative z-10 flex items-center gap-2">
              {renderIcon()}
              <span>{tab.label}</span>
              {tab.badge !== undefined && (
                <span
                  className={cn(
                    'rounded-full px-2 py-0.5 text-[10px] font-semibold leading-none',
                    isActive ? 'bg-white/20 text-ink' : 'bg-white/10 text-muted',
                  )}
                >
                  {tab.badge}
                </span>
              )}
            </span>
          </button>
        )
      })}
    </div>
  )
}
