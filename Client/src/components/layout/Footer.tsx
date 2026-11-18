import { Link } from 'react-router'
import { Terminal, Trophy, Mic, Code2, Heart } from 'lucide-react'
import { Logo } from './Logo'

const practiceLinks = [
  { label: 'Problem Catalog', to: '/practice' },
  { label: 'Dashboard', to: '/dashboard' },
  { label: 'Contest Arena', to: '/contests' },
]

const contestLinks = [
  { label: 'All Contests', to: '/contests' },
  { label: 'Live Contests', to: '/contests' },
  { label: 'Leaderboards', to: '/contests' },
]

const interviewLinks = [
  { label: 'Start Interview', to: '/interview' },
  { label: 'Past Sessions', to: '/interviews' },
  { label: 'MERN & Python', to: '/interview' },
]

export function Footer() {
  const currentYear = new Date().getFullYear()

  return (
    <footer className="mt-auto border-t border-white/10 bg-[#090C13] text-sm text-muted">
      <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
        <div className="grid grid-cols-3 gap-x-4 gap-y-8 lg:grid-cols-5 lg:gap-10">
          {/* Brand */}
          <div className="col-span-3 flex flex-col gap-3 lg:col-span-2">
            <Link to="/" className="inline-flex w-fit shrink-0" aria-label="MockKernel home">
              <Logo />
            </Link>
            <p className="max-w-sm text-xs leading-relaxed text-muted sm:text-sm">
              Solve coding problems, compete in live contests, and practice explaining your
              thinking with AI mock interviews.
            </p>
            <span className="hidden w-fit items-center gap-2 rounded-full border border-cyan/25 bg-cyan/10 px-3 py-1 text-[11px] font-mono text-cyan sm:inline-flex">
              <Terminal className="size-3.5" aria-hidden />
              Practice. Compete. Explain.
            </span>
          </div>

          {/* Practice */}
          <div className="flex min-w-0 flex-col gap-2.5">
            <h2 className="flex items-center gap-1.5 text-[11px] font-mono font-semibold uppercase tracking-wider text-ink sm:text-xs">
              <Terminal className="size-3.5 shrink-0 text-cyan" aria-hidden />
              Practice
            </h2>
            <ul className="flex flex-col gap-1.5 text-[11px] sm:text-xs">
              {practiceLinks.map((link) => (
                <li key={link.label}>
                  <Link to={link.to} className="transition-colors hover:text-ink">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Contests */}
          <div className="flex min-w-0 flex-col gap-2.5">
            <h2 className="flex items-center gap-1.5 text-[11px] font-mono font-semibold uppercase tracking-wider text-ink sm:text-xs">
              <Trophy className="size-3.5 shrink-0 text-cyan" aria-hidden />
              Contests
            </h2>
            <ul className="flex flex-col gap-1.5 text-[11px] sm:text-xs">
              {contestLinks.map((link) => (
                <li key={link.label}>
                  <Link to={link.to} className="transition-colors hover:text-ink">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Interview */}
          <div className="flex min-w-0 flex-col gap-2.5">
            <h2 className="flex items-center gap-1.5 text-[11px] font-mono font-semibold uppercase tracking-wider text-ink sm:text-xs">
              <Mic className="size-3.5 shrink-0 text-cyan" aria-hidden />
              Interview
            </h2>
            <ul className="flex flex-col gap-1.5 text-[11px] sm:text-xs">
              {interviewLinks.map((link) => (
                <li key={link.label}>
                  <Link to={link.to} className="transition-colors hover:text-ink">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <div className="border-t border-white/5 bg-black/30 py-4">
        <div className="mx-auto flex w-full max-w-7xl flex-col items-center justify-between gap-2.5 px-4 text-center text-[10px] text-muted sm:flex-row sm:px-6 sm:text-left sm:text-[11px] lg:px-8">
          <p>© {currentYear} MockKernel. All rights reserved.</p>
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5">
            <span className="inline-flex items-center gap-1.5">
              <Code2 className="size-3.5" aria-hidden />
              Built for focused practice
            </span>
            <span className="hidden text-white/10 sm:inline">•</span>
            <span className="inline-flex items-center gap-1.5">
              <Heart className="size-3.5 text-pink" aria-hidden />
              React · Express · MongoDB
            </span>
          </div>
        </div>
      </div>
    </footer>
  )
}
