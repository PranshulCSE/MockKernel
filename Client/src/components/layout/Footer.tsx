import { Link } from 'react-router'
import { Logo } from './Logo'

export function Footer() {
  const currentYear = new Date().getFullYear()

  return (
    <footer className="mt-auto border-t border-line bg-base/80 text-xs text-muted">
      <div className="mx-auto flex w-full max-w-7xl flex-col items-center justify-between gap-4 px-4 py-5 sm:flex-row sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <Link to="/" className="inline-flex shrink-0" aria-label="MockKernel home">
            <Logo />
          </Link>
          <span className="hidden h-4 w-px bg-line sm:block" />
          <p className="hidden sm:block">Practice. Compete. Explain.</p>
        </div>

        <nav aria-label="Footer" className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
          <Link to="/practice" className="transition-colors hover:text-cyan">Practice</Link>
          <Link to="/contests" className="transition-colors hover:text-cyan">Contests</Link>
          <Link to="/interview" className="transition-colors hover:text-cyan">Interviews</Link>
        </nav>

        <p>© {currentYear} MockKernel</p>
      </div>
    </footer>
  )
}
