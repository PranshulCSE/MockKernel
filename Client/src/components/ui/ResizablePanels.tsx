import { useState, useRef, useEffect, useCallback, type ReactNode } from 'react'
import { cn } from '../../lib/cn'

export interface ResizablePanelsProps {
  direction?: 'horizontal' | 'vertical'
  initialSplit?: number // percentage 0 - 100
  minSplit?: number // minimum percentage, default 20
  maxSplit?: number // maximum percentage, default 80
  first: ReactNode
  second: ReactNode
  className?: string
  firstClassName?: string
  secondClassName?: string
}

export function ResizablePanels({
  direction = 'horizontal',
  initialSplit = 50,
  minSplit = 20,
  maxSplit = 80,
  first,
  second,
  className,
  firstClassName,
  secondClassName,
}: ResizablePanelsProps) {
  const [split, setSplit] = useState(initialSplit)
  const isDragging = useRef(false)
  const [activeDrag, setActiveDrag] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault()
    isDragging.current = true
    setActiveDrag(true)
  }, [])

  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      if (!isDragging.current || !containerRef.current) return

      const rect = containerRef.current.getBoundingClientRect()
      let percentage: number

      if (direction === 'horizontal') {
        const offset = e.clientX - rect.left
        percentage = (offset / rect.width) * 100
      } else {
        const offset = e.clientY - rect.top
        percentage = (offset / rect.height) * 100
      }

      if (percentage < minSplit) percentage = minSplit
      if (percentage > maxSplit) percentage = maxSplit
      setSplit(percentage)
    }

    const handlePointerUp = () => {
      if (isDragging.current) {
        isDragging.current = false
        setActiveDrag(false)
      }
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)

    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }
  }, [direction, minSplit, maxSplit])

  const isH = direction === 'horizontal'

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative flex h-full w-full overflow-hidden select-none',
        isH ? 'flex-row' : 'flex-col',
        className
      )}
    >
      {/* First Panel */}
      <div
        style={{ [isH ? 'width' : 'height']: `${split}%` }}
        className={cn('relative overflow-hidden', firstClassName)}
      >
        {first}
      </div>

      {/* Splitter Handle */}
      <div
        role="separator"
        aria-orientation={direction}
        tabIndex={0}
        onPointerDown={handlePointerDown}
        onDoubleClick={() => setSplit(initialSplit)}
        onKeyDown={(e) => {
          if (isH) {
            if (e.key === 'ArrowLeft') setSplit((s) => Math.max(minSplit, s - 2))
            if (e.key === 'ArrowRight') setSplit((s) => Math.min(maxSplit, s + 2))
          } else {
            if (e.key === 'ArrowUp') setSplit((s) => Math.max(minSplit, s - 2))
            if (e.key === 'ArrowDown') setSplit((s) => Math.min(maxSplit, s + 2))
          }
        }}
        className={cn(
          'group relative z-10 flex shrink-0 items-center justify-center transition-colors',
          isH
            ? 'w-2 cursor-col-resize hover:bg-cyan/20 active:bg-cyan/30'
            : 'h-2 cursor-row-resize hover:bg-cyan/20 active:bg-cyan/30',
          activeDrag && 'bg-cyan/30'
        )}
      >
        {/* Subtle decorative bar in center */}
        <div
          className={cn(
            'rounded-full bg-white/20 transition-all group-hover:bg-cyan group-active:bg-cyan',
            activeDrag && 'bg-cyan shadow-glow-cyan',
            isH ? 'h-8 w-1' : 'h-1 w-8'
          )}
        />
      </div>

      {/* Second Panel */}
      <div
        style={{ [isH ? 'width' : 'height']: `${100 - split}%` }}
        className={cn('relative overflow-hidden', secondClassName)}
      >
        {second}
      </div>
    </div>
  )
}
