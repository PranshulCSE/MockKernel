import { Sun, Moon } from 'lucide-react'
import { useThemeStore } from '../../store/themeStore'
import { cn } from '../../lib/cn'

interface ThemeToggleProps {
  className?: string
}

export function ThemeToggle({ className }: ThemeToggleProps) {
  const { theme, toggleTheme } = useThemeStore()

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
      title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
      className={cn(
        'relative inline-flex size-9 items-center justify-center rounded-full border transition-all duration-200',
        'border-white/10 bg-white/5 text-muted hover:text-ink hover:bg-white/10 hover:border-white/20',
        className
      )}
    >
      {theme === 'light' ? (
        <Moon className="size-4 text-violet transition-transform rotate-0 hover:-rotate-12" />
      ) : (
        <Sun className="size-4 text-warn transition-transform rotate-0 hover:rotate-45" />
      )}
    </button>
  )
}
