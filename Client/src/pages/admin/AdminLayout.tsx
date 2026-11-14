import { NavLink, Outlet, Link } from 'react-router'
import { LayoutDashboard, Code, Trophy, Users, Shield, ArrowLeft } from 'lucide-react'
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
    ...(isSuperAdmin
      ? [{ to: '/admin/users', label: 'Users', icon: Users, end: false }]
      : []),
  ]

  return (
    <div className="flex flex-col gap-8 max-w-7xl mx-auto pb-24">
      {/* Admin Suite Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-6">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <Shield className="size-5 text-cyan" />
            <h1 className="font-display text-2xl sm:text-3xl font-bold text-ink">
              MockKernel Control Room
            </h1>
            <Badge tone={isSuperAdmin ? 'flag' : 'run'}>
              {isSuperAdmin ? 'SuperAdmin' : 'Admin'}
            </Badge>
          </div>
          <p className="font-sans text-xs text-muted">
            Platform governance, problem authoring, live contest monitoring & plagiarism audits.
          </p>
        </div>

        <Link
          to="/dashboard"
          className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 font-sans text-xs font-medium text-muted hover:text-ink hover:bg-white/10 transition-colors"
        >
          <ArrowLeft className="size-3.5" />
          <span>Back to Student Portal</span>
        </Link>
      </div>

      {/* Admin Tab Navigation */}
      <nav aria-label="Admin Navigation" className="flex items-center gap-2 border-b border-white/10 pb-2">
        {navLinks.map((l) => (
          <NavLink
            key={l.to}
            to={l.to}
            end={l.end}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold font-sans transition-colors',
                isActive
                  ? 'bg-brand text-ink shadow-glow'
                  : 'text-muted hover:text-ink hover:bg-white/5',
              )
            }
          >
            <l.icon className="size-3.5" />
            <span>{l.label}</span>
          </NavLink>
        ))}
      </nav>

      {/* Subpage content */}
      <Outlet />
    </div>
  )
}
