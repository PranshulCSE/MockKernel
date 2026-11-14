import { useState, useEffect } from 'react'
import { Link } from 'react-router'
import {
  Code,
  Trophy,
  Users,
  Send,
  CheckCircle,
  ArrowRight,
  ShieldCheck,
  Radio,
} from 'lucide-react'
import { GlassCard, Button, Skeleton } from '../../components/ui'
import { getAdminStats, type AdminStats } from '../../api/admin'
import { useAuthStore } from '../../store/authStore'

export default function AdminOverviewPage() {
  const user = useAuthStore((s) => s.user)
  const isSuperAdmin = user?.role === 'superadmin'

  const [stats, setStats] = useState<AdminStats | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let isMounted = true
    const loadStats = async () => {
      try {
        const data = await getAdminStats()
        if (isMounted) setStats(data)
      } catch {
        // Silently handled
      } finally {
        if (isMounted) setIsLoading(false)
      }
    }

    void loadStats()
    return () => {
      isMounted = false
    }
  }, [])

  return (
    <div className="flex flex-col gap-8">
      {/* Metric KPI Tiles */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <GlassCard className="p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs uppercase tracking-wider text-muted">Total Problems</span>
            <Code className="size-4 text-cyan" />
          </div>
          <div className="mt-4">
            {isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <span className="font-display text-3xl font-extrabold text-ink">
                {stats?.totalProblems ?? 0}
              </span>
            )}
            <p className="mt-1 font-sans text-[11px] text-muted">Authored bank</p>
          </div>
        </GlassCard>

        <GlassCard className="p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs uppercase tracking-wider text-muted">Published</span>
            <CheckCircle className="size-4 text-ok" />
          </div>
          <div className="mt-4">
            {isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <span className="font-display text-3xl font-extrabold text-ok">
                {stats?.publishedProblems ?? 0}
              </span>
            )}
            <p className="mt-1 font-sans text-[11px] text-muted">Active in catalog</p>
          </div>
        </GlassCard>

        <GlassCard className="p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs uppercase tracking-wider text-muted">Live Contests</span>
            <Radio className="size-4 text-warn animate-pulse" />
          </div>
          <div className="mt-4">
            {isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <span className="font-display text-3xl font-extrabold text-warn">
                {stats?.liveContests ?? 0}
              </span>
            )}
            <p className="mt-1 font-sans text-[11px] text-muted">Currently in session</p>
          </div>
        </GlassCard>

        <GlassCard className="p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs uppercase tracking-wider text-muted">Submissions</span>
            <Send className="size-4 text-run" />
          </div>
          <div className="mt-4">
            {isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <span className="font-display text-3xl font-extrabold text-ink">
                {stats?.totalSubmissions ?? 0}
              </span>
            )}
            <p className="mt-1 font-sans text-[11px] text-muted">Executed by Judge0</p>
          </div>
        </GlassCard>

        <GlassCard className="p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs uppercase tracking-wider text-muted">Total Users</span>
            <Users className="size-4 text-pink" />
          </div>
          <div className="mt-4">
            {isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <span className="font-display text-3xl font-extrabold text-ink">
                {stats?.totalUsers ?? 0}
              </span>
            )}
            <p className="mt-1 font-sans text-[11px] text-muted">Registered students</p>
          </div>
        </GlassCard>
      </div>

      {/* Control Room Modules */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {/* Problems Management */}
        <GlassCard strong className="p-6 flex flex-col justify-between">
          <div className="space-y-3">
            <div className="grid size-12 place-items-center rounded-full bg-cyan/10 text-cyan border border-cyan/20">
              <Code className="size-6" />
            </div>
            <h3 className="font-display text-lg font-bold text-ink">Problems Authoring</h3>
            <p className="font-sans text-xs text-muted leading-relaxed">
              Create, edit, and publish coding problems with multi-language starter code, test case suites, and constraints.
            </p>
          </div>
          <div className="pt-6 border-t border-white/10 mt-6">
            <Link to="/admin/problems">
              <Button variant="primary" size="sm" rightIcon={<ArrowRight className="size-4" />}>
                Manage Problems
              </Button>
            </Link>
          </div>
        </GlassCard>

        {/* Contests Management */}
        <GlassCard strong className="p-6 flex flex-col justify-between">
          <div className="space-y-3">
            <div className="grid size-12 place-items-center rounded-full bg-warn/10 text-warn border border-warn/20">
              <Trophy className="size-6" />
            </div>
            <h3 className="font-display text-lg font-bold text-ink">Contests & Plagiarism</h3>
            <p className="font-sans text-xs text-muted leading-relaxed">
              Schedule competitions, trigger live start/end, monitor real-time participant submissions, and review plagiarism flags.
            </p>
          </div>
          <div className="pt-6 border-t border-white/10 mt-6">
            <Link to="/admin/contests">
              <Button variant="secondary" size="sm" rightIcon={<ArrowRight className="size-4" />}>
                Manage Contests
              </Button>
            </Link>
          </div>
        </GlassCard>

        {/* SuperAdmin User Governance */}
        <GlassCard strong className="p-6 flex flex-col justify-between">
          <div className="space-y-3">
            <div className="grid size-12 place-items-center rounded-full bg-pink/10 text-pink border border-pink/20">
              <ShieldCheck className="size-6" />
            </div>
            <h3 className="font-display text-lg font-bold text-ink">User Administration</h3>
            <p className="font-sans text-xs text-muted leading-relaxed">
              SuperAdmin role management: audit accounts, search users by email, and provision new administrator privileges.
            </p>
          </div>
          <div className="pt-6 border-t border-white/10 mt-6">
            {isSuperAdmin ? (
              <Link to="/admin/users">
                <Button variant="ghost" size="sm" rightIcon={<ArrowRight className="size-4" />}>
                  Manage Users
                </Button>
              </Link>
            ) : (
              <span className="font-mono text-xs text-muted/60">SuperAdmin access required</span>
            )}
          </div>
        </GlassCard>
      </div>
    </div>
  )
}
