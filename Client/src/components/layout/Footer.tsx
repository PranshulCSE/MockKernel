import { Link } from 'react-router'
import {
  Terminal,
  Trophy,
  Mic,
} from 'lucide-react'
import { Logo } from './Logo'

export function Footer() {
  const currentYear = 2026

  return (
    <footer className="border-t border-white/10 bg-[#090C13] text-muted text-sm mt-auto">
      {/* Upper Main Footer Grid */}
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12 lg:py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-10 lg:gap-8">
          {/* Brand Info & Mission (2 cols on lg) */}
          <div className="flex flex-col gap-4 lg:col-span-2">
            <Link to="/" className="inline-block shrink-0">
              <Logo />
            </Link>
            <p className="text-xs sm:text-sm text-muted leading-relaxed max-w-sm">
              MockKernel bridges algorithmic mastery with real-world communication.
              Solve high-caliber coding problems in sandboxed environments, then practice
              explaining trade-offs out loud with adaptive AI voice interviewers.
            </p>

            {/* Platform Status Pill */}
            <div className="flex items-center gap-2 pt-2">
              <div className="inline-flex items-center gap-2 rounded-full border border-ok/30 bg-ok/10 px-3 py-1 text-xs font-mono text-ok">
                <span className="size-2 rounded-full bg-ok shadow-[0_0_8px_#34D399] animate-pulse" />
                <span>All Systems Operational</span>
              </div>
            </div>
          </div>

          {/* Column 1: Problem Catalog */}
          <div className="flex flex-col gap-3">
            <h4 className="text-xs font-mono uppercase tracking-wider text-ink font-semibold flex items-center gap-1.5">
              <Terminal className="size-3.5 text-cyan" />
              Practice Arena
            </h4>
            <ul className="flex flex-col gap-2 text-xs">
              <li>
                <Link to="/practice" className="hover:text-ink transition-colors">
                  All Problems
                </Link>
              </li>
              <li>
                <Link to="/practice" className="hover:text-ink transition-colors">
                  Algorithms & DSA
                </Link>
              </li>
              <li>
                <Link to="/practice" className="hover:text-ink transition-colors">
                  Dynamic Programming
                </Link>
              </li>
              <li>
                <Link to="/practice" className="hover:text-ink transition-colors">
                  System Design & Concurrency
                </Link>
              </li>
              <li>
                <Link to="/practice" className="hover:text-ink transition-colors">
                  Python, C++, Java, JS
                </Link>
              </li>
            </ul>
          </div>

          {/* Column 2: Contests & Leaderboard */}
          <div className="flex flex-col gap-3">
            <h4 className="text-xs font-mono uppercase tracking-wider text-ink font-semibold flex items-center gap-1.5">
              <Trophy className="size-3.5 text-cyan" />
              Contests
            </h4>
            <ul className="flex flex-col gap-2 text-xs">
              <li>
                <Link to="/contests" className="hover:text-ink transition-colors">
                  Live & Upcoming Rounds
                </Link>
              </li>
              <li>
                <Link to="/contests" className="hover:text-ink transition-colors">
                  Weekly Arena Tournaments
                </Link>
              </li>
              <li>
                <Link to="/contests" className="hover:text-ink transition-colors">
                  Realtime Standings
                </Link>
              </li>
              <li>
                <Link to="/contests" className="hover:text-ink transition-colors">
                  Anti-Plagiarism Guardrails
                </Link>
              </li>
              <li>
                <Link to="/dashboard" className="hover:text-ink transition-colors">
                  Global Rating & Badges
                </Link>
              </li>
            </ul>
          </div>

          {/* Column 3: Mock Interview */}
          <div className="flex flex-col gap-3">
            <h4 className="text-xs font-mono uppercase tracking-wider text-ink font-semibold flex items-center gap-1.5">
              <Mic className="size-3.5 text-cyan" />
              AI Mock Interview
            </h4>
            <ul className="flex flex-col gap-2 text-xs">
              <li>
                <Link to="/interview" className="hover:text-ink transition-colors">
                  Voice Interviewer
                </Link>
              </li>
              <li>
                <Link to="/interview" className="hover:text-ink transition-colors">
                  MERN Stack Interviews
                </Link>
              </li>
              <li>
                <Link to="/interview" className="hover:text-ink transition-colors">
                  Python Architecture
                </Link>
              </li>
              <li>
                <Link to="/interview" className="hover:text-ink transition-colors">
                  OS & DBMS Fundamentals
                </Link>
              </li>
              <li>
                <Link to="/interviews" className="hover:text-ink transition-colors">
                  Performance History
                </Link>
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* Lower Copyright & Legal Bar */}
      <div className="border-t border-white/5 bg-black/40 py-6">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-muted">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-center sm:text-left">
            <span>© {currentYear} MockKernel Inc. All rights reserved.</span>
            <span className="hidden sm:inline text-white/10">•</span>
            <span className="hover:text-ink transition-colors cursor-pointer">Privacy Policy</span>
            <span className="hidden sm:inline text-white/10">•</span>
            <span className="hover:text-ink transition-colors cursor-pointer">Terms of Service</span>
            <span className="hidden sm:inline text-white/10">•</span>
            <span className="hover:text-ink transition-colors cursor-pointer">Security Safeguards</span>
          </div>

          <div className="flex items-center gap-4">
            <span className="font-mono text-[11px] text-muted/60">
              MockKernel v2.4 (Engine: Judge0 + Groq AI)
            </span>
          </div>
        </div>
      </div>
    </footer>
  )
}
