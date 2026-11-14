import { useState, useEffect } from 'react'
import { Link, NavLink, useNavigate, useLocation } from 'react-router'
import {
  LogOut,
  Shield,
  LayoutDashboard,
  Terminal,
  Trophy,
  Mic,
  Menu,
  X,
} from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { cn } from '../../lib/cn'
import { Button, Badge } from '../ui'
import { Logo } from './Logo'

export function Navbar() {
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const navigate = useNavigate()
  const location = useLocation()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  // Close mobile drawer when route changes
  useEffect(() => {
    setMobileMenuOpen(false)
  }, [location.pathname])

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  const isAdmin = user?.role === 'admin' || user?.role === 'superadmin'

  const navLinks = [
    { to: '/practice', label: 'Practice', icon: Terminal },
    { to: '/contests', label: 'Contests', icon: Trophy },
    { to: '/interview', label: 'Mock Interview', icon: Mic },
    ...(user ? [{ to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard }] : []),
    ...(isAdmin ? [{ to: '/admin', label: 'Admin Suite', icon: Shield }] : []),
  ]

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-base/85 backdrop-blur-xl transition-all">
      <nav aria-label="Main" className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-6 lg:gap-8">
          <Link to="/" aria-label="MockKernel home" className="shrink-0 flex items-center gap-2 group">
            <Logo />
          </Link>

          {/* Desktop Navigation Links */}
          <ul className="hidden md:flex items-center gap-1">
            {navLinks.map((l) => (
              <li key={l.to}>
                <NavLink
                  to={l.to}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs lg:text-sm font-medium transition-all duration-150',
                      isActive
                        ? 'bg-cyan/15 text-cyan border border-cyan/30 shadow-glow-cyan font-semibold'
                        : 'text-muted hover:text-ink hover:bg-white/5 border border-transparent'
                    )
                  }
                >
                  <l.icon className="size-4 opacity-80" aria-hidden />
                  {l.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>

        {/* Right Desktop User & Auth Area */}
        <div className="hidden md:flex items-center gap-3">
          {user ? (
            <div className="flex items-center gap-3">
              {isAdmin && (
                <Badge tone={user.role === 'superadmin' ? 'flag' : 'run'}>
                  <Shield className="size-3 mr-1" aria-hidden />
                  {user.role === 'superadmin' ? 'SuperAdmin' : 'Admin'}
                </Badge>
              )}
              <Link
                to="/dashboard"
                className="flex items-center gap-2.5 rounded-full py-1 px-2 hover:bg-white/5 transition-colors"
              >
                <span
                  className="grid size-8 place-items-center rounded-full bg-cyan/20 border border-cyan/40 text-xs font-bold text-cyan shadow-glow-cyan"
                  aria-hidden
                >
                  {user.name.charAt(0).toUpperCase()}
                </span>
                <span className="text-sm font-medium text-ink max-w-[120px] truncate">{user.name}</span>
              </Link>
              <Button
                variant="ghost"
                size="sm"
                leftIcon={<LogOut className="size-4" />}
                onClick={handleLogout}
                aria-label="Log out"
                className="text-xs text-muted hover:text-ink hover:bg-white/5"
              >
                Log out
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Link
                to="/login"
                className="rounded-full px-4 py-2 text-xs lg:text-sm font-medium text-muted hover:text-ink hover:bg-white/5 transition-colors"
              >
                Log in
              </Link>
              <Link
                to="/signup"
                className="rounded-full bg-brand px-5 py-2 text-xs lg:text-sm font-semibold text-ink shadow-glow transition hover:brightness-110 active:scale-95"
              >
                Sign up
              </Link>
            </div>
          )}
        </div>

        {/* Mobile Hamburger Toggle Button */}
        <div className="flex md:hidden items-center gap-2">
          {user && (
            <Link to="/dashboard" className="flex items-center">
              <span className="grid size-8 place-items-center rounded-full bg-cyan/20 border border-cyan/40 text-xs font-bold text-cyan">
                {user.name.charAt(0).toUpperCase()}
              </span>
            </Link>
          )}
          <button
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            aria-label="Toggle navigation menu"
            aria-expanded={mobileMenuOpen}
            className="flex size-9 items-center justify-center rounded-ctl border border-white/10 bg-white/5 text-ink hover:bg-white/10 transition-colors"
          >
            {mobileMenuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </nav>

      {/* Mobile Collapsible Dropdown Menu */}
      {mobileMenuOpen && (
        <div className="md:hidden border-b border-white/10 bg-base/95 backdrop-blur-2xl px-4 py-5 animate-fadeIn">
          <div className="flex flex-col gap-4">
            {/* User status banner if logged in */}
            {user && (
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <div className="flex items-center gap-3">
                  <span className="grid size-9 place-items-center rounded-full bg-cyan/20 border border-cyan/40 text-sm font-bold text-cyan shadow-glow-cyan">
                    {user.name.charAt(0).toUpperCase()}
                  </span>
                  <div className="flex flex-col">
                    <span className="text-sm font-semibold text-ink">{user.name}</span>
                    <span className="text-xs text-muted font-mono">{user.email}</span>
                  </div>
                </div>
                {isAdmin && (
                  <Badge tone={user.role === 'superadmin' ? 'flag' : 'run'}>
                    {user.role}
                  </Badge>
                )}
              </div>
            )}

            {/* Nav list */}
            <ul className="flex flex-col gap-1">
              {navLinks.map((l) => (
                <li key={l.to}>
                  <NavLink
                    to={l.to}
                    onClick={() => setMobileMenuOpen(false)}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-3 rounded-ctl px-3.5 py-2.5 text-sm font-medium transition-all',
                        isActive
                          ? 'bg-cyan/15 text-cyan border border-cyan/30 font-semibold'
                          : 'text-muted hover:text-ink hover:bg-white/5 border border-transparent'
                      )
                    }
                  >
                    <l.icon className="size-4 shrink-0 text-cyan/80" />
                    <span>{l.label}</span>
                  </NavLink>
                </li>
              ))}
            </ul>

            {/* Mobile Auth actions */}
            <div className="border-t border-white/10 pt-3 flex flex-col gap-2">
              {user ? (
                <button
                  onClick={() => {
                    setMobileMenuOpen(false)
                    handleLogout()
                  }}
                  className="flex items-center justify-center gap-2 rounded-ctl border border-bad/30 bg-bad/10 py-2.5 text-sm font-medium text-bad hover:bg-bad/20 transition-colors w-full"
                >
                  <LogOut className="size-4" />
                  Log out
                </button>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <Link
                    to="/login"
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex items-center justify-center rounded-ctl border border-white/15 bg-white/5 py-2.5 text-sm font-medium text-ink hover:bg-white/10 transition-colors"
                  >
                    Log in
                  </Link>
                  <Link
                    to="/signup"
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex items-center justify-center rounded-ctl bg-brand py-2.5 text-sm font-semibold text-ink shadow-glow transition hover:brightness-110"
                  >
                    Sign up
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  )
}
