import { Link } from 'react-router'
import { Logo } from './Logo'

export function Footer() {
  const currentYear = new Date().getFullYear()

  return (
    <footer className="mt-auto border-t border-line bg-surface/60 backdrop-blur-sm text-xs text-muted">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <Link to="/" className="inline-flex shrink-0" aria-label="MockKernel home">
            <Logo />
          </Link>
          <span className="hidden h-4 w-px bg-line sm:block" />
          <p className="hidden sm:block">Practice. Compete. Explain.</p>
        </div>
        <p>&copy; {currentYear} MockKernel</p>
      </div>
    </footer>
  )
}
