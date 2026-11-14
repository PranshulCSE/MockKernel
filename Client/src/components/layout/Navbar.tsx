import { Link, NavLink, useNavigate } from 'react-router'
import { LogOut, Shield, LayoutDashboard, Terminal, Trophy, Mic } from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { cn } from '../../lib/cn'
import { Button, Badge } from '../ui'
import { Logo } from './Logo'

export function Navbar() {
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const navigate = useNavigate()

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  const isAdmin = user?.role === 'admin' || user?.role === 'superadmin'

  const navLinks = [
    { to: '/practice', label: 'Practice', icon: Terminal },
    { to: '/contests', label: 'Contests', icon: Trophy },
    { to: '/interview', label: 'Interview', icon: Mic },
    ...(user ? [{ to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard }] : []),
    ...(isAdmin ? [{ to: '/admin', label: 'Admin Panel', icon: Shield }] : []),
  ]

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-base/80 backdrop-blur-xl">
      <nav aria-label="Main" className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
        <div className="flex items-center gap-8">
          <Link to="/" aria-label="MockKernel home" className="shrink-0">
            <Logo />
          </Link>

          <ul className="hidden items-center gap-1 md:flex">
            {navLinks.map((l) => (
              <li key={l.to}>
                <NavLink
                  to={l.to}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-white/10 text-ink shadow-inner'
                        : 'text-muted hover:text-ink hover:bg-white/5',
                    )
                  }
                >
                  <l.icon className="size-4 opacity-70" aria-hidden />
                  {l.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>

        {user ? (
          <div className="flex items-center gap-3">
            {isAdmin && (
              <div className="hidden sm:block">
                <Badge tone={user.role === 'superadmin' ? 'flag' : 'run'}>
                  <Shield className="size-3" aria-hidden />
                  {user.role === 'superadmin' ? 'SuperAdmin' : 'Admin'}
                </Badge>
              </div>
            )}
            <div className="flex items-center gap-2.5">
              <span
                className="grid size-8 place-items-center rounded-full bg-brand text-xs font-bold text-ink shadow-glow"
                aria-hidden
              >
                {user.name.charAt(0).toUpperCase()}
              </span>
              <span className="hidden text-sm font-medium text-ink lg:block">{user.name}</span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              leftIcon={<LogOut className="size-4" />}
              onClick={handleLogout}
              aria-label="Log out"
            >
              <span className="hidden sm:inline">Log out</span>
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Link
              to="/login"
              className="rounded-full px-4 py-2 text-sm font-medium text-muted hover:text-ink hover:bg-white/5 transition-colors"
            >
              Log in
            </Link>
            <Link
              to="/signup"
              className="rounded-full bg-brand px-5 py-2 text-sm font-semibold text-ink shadow-glow transition hover:brightness-110 active:scale-95"
            >
              Sign up
            </Link>
          </div>
        )}
      </nav>
    </header>
  )
}
