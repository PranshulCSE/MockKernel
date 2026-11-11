import { Link, NavLink } from 'react-router'
import { LogOut } from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { cn } from '../../lib/cn'
import { Button } from '../ui'
import { Logo } from './Logo'

const links = [
  { to: '/practice', label: 'Coding practice' },
  { to: '/interview', label: 'Mock interview' },
]

export function Navbar() {
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)

  return (
    <header className="sticky top-0 z-20 border-b border-white/10 bg-base/60 backdrop-blur-xl">
      <nav aria-label="Main" className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-6">
        <Link to="/" aria-label="MockKernel home">
          <Logo />
        </Link>

        <ul className="hidden items-center gap-1 md:flex">
          {links.map((l) => (
            <li key={l.to}>
              <NavLink
                to={l.to}
                className={({ isActive }) =>
                  cn(
                    'rounded-full px-4 py-2 text-sm font-medium transition-colors',
                    isActive ? 'bg-white/10 text-ink' : 'text-muted hover:text-ink',
                  )
                }
              >
                {l.label}
              </NavLink>
            </li>
          ))}
        </ul>

        {user ? (
          <div className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-full bg-brand text-sm font-bold" aria-hidden>
              {user.name.charAt(0).toUpperCase()}
            </span>
            <span className="hidden text-sm sm:block">{user.name}</span>
            <Button variant="ghost" size="sm" leftIcon={<LogOut className="size-4" />} onClick={logout}>
              Log out
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Link to="/login" className="rounded-full px-4 py-2 text-sm font-medium text-muted hover:text-ink">
              Log in
            </Link>
            <Link
              to="/signup"
              className="rounded-full bg-brand px-5 py-2 text-sm font-semibold shadow-glow transition hover:brightness-110"
            >
              Sign up
            </Link>
          </div>
        )}
      </nav>
    </header>
  )
}
