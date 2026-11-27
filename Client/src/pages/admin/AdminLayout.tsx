import { NavLink, Outlet, Link } from 'react-router'
import { LayoutDashboard, Code, Trophy, Users, ArrowLeft, Shield, ShieldAlert } from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { cn } from '../../lib/cn'
import { Badge } from '../../components/ui'

export default function AdminLayout() {
  const user = useAuthStore((s) => s.user)
  const isSuperAdmin = user?.role === 'superadmin'

  const navLinks = [
    { to: '/admin', label: 'Overview', icon: LayoutDashboard, end: true },
    { to: '/admin/problems', label: 'Problems', icon: Code, end: false },
    { to: '/admin/contests', label: 'Contests', icon: Trophy, end: false },
    { to: '/admin/assessments', label: 'Assessments', icon: ShieldAlert, end: false },
    ...(isSuperAdmin
      ? [{ to: '/admin/users', label: 'Users', icon: Users, end: false }]
      : []),
  ]

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col pb-16 sm:pb-24">
      <div className="sticky top-16 z-30 -mx-3 border-b border-line bg-base/95 px-3 py-3 backdrop-blur-xl sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="grid size-8 shrink-0 place-items-center rounded-full border border-cyan/25 bg-cyan/10">
              <Shield className="size-4 text-cyan" />
            </span>
            <h1 className="truncate font-display text-lg font-bold text-ink sm:text-2xl">
              Control Room
            </h1>
            <Badge tone={isSuperAdmin ? 'flag' : 'run'}>
              {isSuperAdmin ? 'SuperAdmin' : 'Admin'}
            </Badge>
          </div>

          <Link
            to="/dashboard"
            className="flex shrink-0 items-center gap-2 rounded-full border border-line bg-surface-soft px-3 py-2 text-xs font-medium text-muted transition-colors hover:bg-cyan/10 hover:text-ink"
          >
            <ArrowLeft className="size-3.5" />
            <span>Student Portal</span>
          </Link>
        </div>

        <p className="mt-1.5 hidden text-xs text-muted sm:block">
          Platform governance, authoring, live monitoring and audits.
        </p>

        <nav aria-label="Admin Navigation" className="mt-3 flex flex-wrap items-center gap-2 pb-1">
          {navLinks.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.end}
              className={({ isActive }) =>
                cn(
                  'flex shrink-0 items-center gap-2 rounded-full px-3 py-2 text-xs font-semibold transition-colors sm:px-4',
                  isActive
                    ? 'bg-brand text-ink shadow-glow'
                    : 'text-muted hover:bg-surface-soft hover:text-ink',
                )
              }
            >
              <l.icon className="size-3.5" />
              <span>{l.label}</span>
            </NavLink>
          ))}
        </nav>
      </div>

      <div className="pt-6">
        <Outlet />
      </div>
    </div>
  )
}
