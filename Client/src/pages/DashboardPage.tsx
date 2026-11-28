import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router'
import {
  Code,
  Trophy,
  Mic,
  Target,
  ArrowRight,
  Terminal,
  Calendar,
  Sparkles,
  ExternalLink,
  UserRound,
  Lock,
  Eye,
  EyeOff,
} from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import { GlassCard, Button, Badge, VerdictBadge, Skeleton, EmptyState } from '../components/ui'
import { listUserSubmissions, type SubmissionItem } from '../api/submissions'
import { listInterviews, type InterviewSession } from '../api/interviews'
import { updateAccount } from '../api/auth'
import { Input } from '../components/ui/Input'
import { getMyStats, type UserStats } from '../api/users'
import { useSocket } from '../hooks/useSocket'

export default function DashboardPage() {
  const { onUserStatsUpdate } = useSocket()
  const user = useAuthStore((s) => s.user)
  const setUser = useAuthStore((s) => s.setUser)
  const [profileName, setProfileName] = useState(user?.name || '')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [showCurrentPassword, setShowCurrentPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [accountMessage, setAccountMessage] = useState('')
  const [accountBusy, setAccountBusy] = useState(false)
  const [showAccountSettings, setShowAccountSettings] = useState(false)

  const [submissions, setSubmissions] = useState<SubmissionItem[]>([])
  const [interviews, setInterviews] = useState<InterviewSession[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [stats, setStats] = useState<UserStats | null>(null)

  const refreshStats = useCallback(async () => {
    try {
      setStats(await getMyStats())
    } catch {
      // Keep the last successful counts during temporary network failures.
    }
  }, [])

  useEffect(() => {
    let isMounted = true

    const fetchDashboardData = async () => {
      try {
        const [subRes, intRes, statsRes] = await Promise.allSettled([
          listUserSubmissions({ limit: 20 }),
          listInterviews({ limit: 10 }),
          getMyStats(),
        ])

        if (!isMounted) return

        if (subRes.status === 'fulfilled') {
          setSubmissions(subRes.value.data || [])
        }
        if (intRes.status === 'fulfilled') {
          setInterviews(intRes.value.data || [])
        }
        if (statsRes.status === 'fulfilled') setStats(statsRes.value)
      } catch {
        // Handled silently
      } finally {
        if (isMounted) setIsLoading(false)
      }
    }

    void fetchDashboardData()

    return () => {
      isMounted = false
    }
  }, [])

  useEffect(() => {
    const unsubscribe = onUserStatsUpdate(() => {
      void refreshStats()
    })
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') void refreshStats()
    }
    const timer = window.setInterval(refreshWhenVisible, 15_000)
    window.addEventListener('focus', refreshWhenVisible)
    document.addEventListener('visibilitychange', refreshWhenVisible)

    return () => {
      unsubscribe()
      window.clearInterval(timer)
      window.removeEventListener('focus', refreshWhenVisible)
      document.removeEventListener('visibilitychange', refreshWhenVisible)
    }
  }, [onUserStatsUpdate, refreshStats])

  // KPI Calculations
  const solvedCount = stats?.solvedProblems ?? 0
  const totalSubmissions = stats?.totalSubmissions ?? 0
  const acceptanceRate =
    totalSubmissions > 0
      ? `${(((stats?.acceptedSubmissions ?? 0) / totalSubmissions) * 100).toFixed(0)}%`
      : '0%'
  const completedInterviewsCount = stats?.interviewsCompleted ?? 0
  const contestsCount = stats?.contestsJoined ?? 0

  return (
    <div className="flex flex-col gap-10 max-w-6xl mx-auto pb-20">
      {/* Welcome Banner */}
      <GlassCard strong className="relative p-6 sm:p-8 overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
          <div className="flex items-center gap-5">
            <div className="relative">
              <span
                className="grid size-16 sm:size-20 place-items-center rounded-full bg-brand text-2xl sm:text-3xl font-extrabold text-ink shadow-glow"
                aria-hidden
              >
                {user?.name ? user.name.charAt(0).toUpperCase() : 'U'}
              </span>
              <span className="absolute bottom-0 right-0 size-4 rounded-full bg-ok border-2 border-base" />
            </div>

            <div className="space-y-1">
              <div className="flex items-center gap-2.5">
                <h1 className="font-display text-2xl sm:text-3xl font-bold text-ink">
                  Welcome back, {user?.name || 'Developer'}
                </h1>
                <Badge tone={user?.role === 'superadmin' ? 'flag' : user?.role === 'admin' ? 'run' : 'ok'}>
                  {user?.role?.toUpperCase() || 'STUDENT'}
                </Badge>
              </div>
              <p className="font-sans text-xs sm:text-sm text-muted">
                {user?.email} &bull; Ready to hone your algorithms and AI mock interview speaking?
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Link to="/practice">
              <Button variant="secondary" size="sm" leftIcon={<Terminal className="size-4" />}>
                Practice Arena
              </Button>
            </Link>
            <Link to="/interview">
              <Button variant="primary" size="sm" leftIcon={<Mic className="size-4" />}>
                Start AI Interview
              </Button>
            </Link>
          </div>
        </div>
      </GlassCard>

      <GlassCard className="p-5 sm:p-6">
        <div className="flex items-center gap-3">
          <UserRound className="size-5 text-cyan" />
          <div className="min-w-0">
            <h2 className="font-display text-lg font-bold text-ink">Account settings</h2>
            <p className="text-xs text-muted">Update your display name and password.</p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto shrink-0"
            onClick={() => setShowAccountSettings((prev) => !prev)}
          >
            {showAccountSettings ? 'Close' : 'Manage'}
          </Button>
        </div>
        {showAccountSettings && (
        <div className="mt-5 grid gap-6 border-t border-line pt-5 lg:grid-cols-2">
          <form className="space-y-3" onSubmit={async (event) => {
            event.preventDefault(); setAccountBusy(true); setAccountMessage('')
            try { const next = await updateAccount({ name: profileName }); setUser(next); setAccountMessage('Profile updated.') }
            catch (error) { setAccountMessage(error instanceof Error ? error.message : 'Could not update profile.') }
            finally { setAccountBusy(false) }
          }}>
            <Input
              label="Display name"
              value={profileName}
              onChange={(event) => setProfileName(event.target.value)}
              autoComplete="name"
              leftIcon={<UserRound className="size-[18px]" />}
            />
            <Button type="submit" size="sm" loading={accountBusy}>Save profile</Button>
          </form>
          <form className="space-y-3" onSubmit={async (event) => {
            event.preventDefault(); setAccountBusy(true); setAccountMessage('')
            try { await updateAccount({ currentPassword, newPassword }); setCurrentPassword(''); setNewPassword(''); setAccountMessage('Password updated.') }
            catch (error) { setAccountMessage(error instanceof Error ? error.message : 'Could not update password.') }
            finally { setAccountBusy(false) }
          }}>
            <Input
              label="Current password"
              type={showCurrentPassword ? 'text' : 'password'}
              autoComplete="current-password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              leftIcon={<Lock className="size-[18px]" />}
              rightSlot={
                <button
                  type="button"
                  aria-label={showCurrentPassword ? 'Hide current password' : 'Show current password'}
                  onClick={() => setShowCurrentPassword((v) => !v)}
                  className="grid size-8 place-items-center rounded-full text-muted hover:text-ink"
                >
                  {showCurrentPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              }
            />
            <Input
              label="New password"
              type={showNewPassword ? 'text' : 'password'}
              autoComplete="new-password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              leftIcon={<Lock className="size-[18px]" />}
              rightSlot={
                <button
                  type="button"
                  aria-label={showNewPassword ? 'Hide new password' : 'Show new password'}
                  onClick={() => setShowNewPassword((v) => !v)}
                  className="grid size-8 place-items-center rounded-full text-muted hover:text-ink"
                >
                  {showNewPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              }
            />
            <Button type="submit" size="sm" loading={accountBusy} disabled={!currentPassword || newPassword.length < 8}>Update password</Button>
          </form>
        </div>
        )}
        <p className="mt-3 text-xs text-muted">
          Signed in as {user?.email}
        </p>
        {accountMessage && <p role="status" className="mt-3 text-xs text-cyan">{accountMessage}</p>}
      </GlassCard>

      {/* KPI Tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        <GlassCard className="p-5 sm:p-6 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs uppercase tracking-wider text-muted">Problems Solved</span>
            <div className="grid size-9 place-items-center rounded-full bg-ok/10 text-ok border border-ok/20">
              <Code className="size-4" />
            </div>
          </div>
          <div className="mt-4">
            {isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <span className="font-display text-3xl font-extrabold text-ink">{solvedCount}</span>
            )}
            <p className="mt-1 font-sans text-xs text-muted">
              {stats?.attemptedProblems ?? 0} problems attempted · unique accepted solutions
            </p>
          </div>
        </GlassCard>

        <GlassCard className="p-5 sm:p-6 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs uppercase tracking-wider text-muted">Contests Participated</span>
            <div className="grid size-9 place-items-center rounded-full bg-cyan/10 text-cyan border border-cyan/20">
              <Trophy className="size-4" />
            </div>
          </div>
          <div className="mt-4">
            {isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <span className="font-display text-3xl font-extrabold text-ink">{contestsCount}</span>
            )}
            <p className="mt-1 font-sans text-xs text-muted">Contests joined</p>
          </div>
        </GlassCard>

        <GlassCard className="p-5 sm:p-6 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs uppercase tracking-wider text-muted">Interviews Completed</span>
            <div className="grid size-9 place-items-center rounded-full bg-violet/10 text-violet border border-violet/20">
              <Mic className="size-4" />
            </div>
          </div>
          <div className="mt-4">
            {isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <span className="font-display text-3xl font-extrabold text-ink">
                {completedInterviewsCount}
              </span>
            )}
            <p className="mt-1 font-sans text-xs text-muted">Evaluated speaking sessions</p>
          </div>
        </GlassCard>

        <GlassCard className="p-5 sm:p-6 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs uppercase tracking-wider text-muted">Acceptance Rate</span>
            <div className="grid size-9 place-items-center rounded-full bg-pink/10 text-pink border border-pink/20">
              <Target className="size-4" />
            </div>
          </div>
          <div className="mt-4">
            {isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <span className="font-display text-3xl font-extrabold text-ink">{acceptanceRate}</span>
            )}
            <p className="mt-1 font-sans text-xs text-muted">
              {stats?.acceptedSubmissions ?? 0} accepted of {totalSubmissions} code attempts
            </p>
          </div>
        </GlassCard>
      </div>

      {/* Quick Action Cards */}
      <div className="grid gap-6 sm:grid-cols-3">
        <GlassCard className="group p-6 flex flex-col justify-between hover:border-cyan/40 transition-colors">
          <div className="space-y-3">
            <div className="grid size-12 place-items-center rounded-full bg-cyan/10 text-cyan border border-cyan/20 group-hover:scale-105 transition-transform">
              <Terminal className="size-6" />
            </div>
            <h3 className="font-display text-lg font-bold text-ink">Solve Daily Problem</h3>
            <p className="font-sans text-xs text-muted leading-relaxed">
              Tackle curated coding problems with Monaco editor, real-time Judge0 test execution, and multiple languages.
            </p>
          </div>
          <div className="pt-6">
            <Link to="/practice">
              <Button variant="ghost" size="sm" rightIcon={<ArrowRight className="size-4" />}>
                Go to Arena
              </Button>
            </Link>
          </div>
        </GlassCard>

        <GlassCard className="group p-6 flex flex-col justify-between hover:border-violet/40 transition-colors">
          <div className="space-y-3">
            <div className="grid size-12 place-items-center rounded-full bg-violet/10 text-violet border border-violet/20 group-hover:scale-105 transition-transform">
              <Sparkles className="size-6" />
            </div>
            <h3 className="font-display text-lg font-bold text-ink">Start Mock Interview</h3>
            <p className="font-sans text-xs text-muted leading-relaxed">
              Practice spoken responses on OS, DBMS, and Data Structures with adaptive AI scoring and feedback.
            </p>
          </div>
          <div className="pt-6">
            <Link to="/interview">
              <Button variant="ghost" size="sm" rightIcon={<ArrowRight className="size-4" />}>
                Setup Interview
              </Button>
            </Link>
          </div>
        </GlassCard>

        <GlassCard className="group p-6 flex flex-col justify-between hover:border-ok/40 transition-colors">
          <div className="space-y-3">
            <div className="grid size-12 place-items-center rounded-full bg-ok/10 text-ok border border-ok/20 group-hover:scale-105 transition-transform">
              <Trophy className="size-6" />
            </div>
            <h3 className="font-display text-lg font-bold text-ink">Browse Live Contests</h3>
            <p className="font-sans text-xs text-muted leading-relaxed">
              Compete against other students in real-time timed contests and climb the live leaderboards.
            </p>
          </div>
          <div className="pt-6">
            <Link to="/contests">
              <Button variant="ghost" size="sm" rightIcon={<ArrowRight className="size-4" />}>
                View Contests
              </Button>
            </Link>
          </div>
        </GlassCard>
      </div>

      {/* Recent Activity Feed */}
      <div className="grid gap-8 lg:grid-cols-2">
        {/* Recent Coding Submissions */}
        <GlassCard className="p-6 flex flex-col gap-5">
          <div className="flex items-center justify-between border-b border-line pb-3">
            <div className="flex items-center gap-2">
              <Code className="size-4 text-cyan" />
              <h3 className="font-display text-base font-bold text-ink">Recent Code Submissions</h3>
            </div>
            <Link to="/practice" className="font-sans text-xs text-cyan hover:underline flex items-center gap-1">
              Practice more <ExternalLink className="size-3" />
            </Link>
          </div>

          {isLoading ? (
            <div className="space-y-3">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : submissions.length === 0 ? (
            <EmptyState
              heading="No submissions yet"
              description="Start practicing algorithms to see your submission verdicts and runtimes here."
              action={{ label: 'Go to Problems', to: '/practice' }}
              className="border-none bg-transparent shadow-none p-4"
            />
          ) : (
            <div className="flex flex-col divide-y divide-line">
              {submissions.slice(0, 6).map((s) => (
                <div key={s.id} className="flex items-center justify-between py-3">
                  <div className="flex items-center gap-3">
                    <VerdictBadge verdict={s.verdict} />
                    <span className="font-mono text-xs text-muted uppercase">{s.language}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    {s.runtime !== undefined && (
                      <span className="font-mono text-xs text-muted">{s.runtime}ms</span>
                    )}
                    <span className="font-mono text-[11px] text-muted/60">
                      {new Date(s.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </GlassCard>

        {/* Recent Mock Interviews */}
        <GlassCard className="p-6 flex flex-col gap-5">
          <div className="flex items-center justify-between border-b border-line pb-3">
            <div className="flex items-center gap-2">
              <Mic className="size-4 text-violet" />
              <h3 className="font-display text-base font-bold text-ink">Recent Mock Interviews</h3>
            </div>
            <Link to="/interviews" className="font-sans text-xs text-cyan hover:underline flex items-center gap-1">
              View all <ExternalLink className="size-3" />
            </Link>
          </div>

          {isLoading ? (
            <div className="space-y-3">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : interviews.length === 0 ? (
            <EmptyState
              heading="No interviews completed"
              description="Test your knowledge on OS, DBMS, and Data Structures out loud with AI voice guidance."
              action={{ label: 'Start Interview', to: '/interview' }}
              className="border-none bg-transparent shadow-none p-4"
            />
          ) : (
            <div className="flex flex-col divide-y divide-line">
              {interviews.slice(0, 6).map((item) => (
                <div key={item.id} className="flex items-center justify-between py-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-display font-semibold text-xs text-ink">
                        {(Array.isArray(item.topics) ? item.topics : []).join(', ') || 'Interview practice'}
                      </span>
                      <Badge tone={item.difficulty === 'Hard' ? 'bad' : item.difficulty === 'Medium' ? 'warn' : 'ok'}>
                        {item.difficulty}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2 text-[11px] font-mono text-muted">
                      <Calendar className="size-3" />
                      <span>{new Date(item.startedAt).toLocaleDateString()}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    {item.overallScore !== undefined && item.status === 'completed' ? (
                      <Badge tone={item.overallScore >= 7 ? 'ok' : 'warn'}>
                        {item.overallScore.toFixed(1)}/10
                      </Badge>
                    ) : (
                      <Badge tone="run">{item.status}</Badge>
                    )}
                    <Link to={item.status === 'completed' ? `/interview/${item.id}/summary` : `/interview/${item.id}`}>
                      <Button variant="ghost" size="sm">
                        {item.status === 'completed' ? 'Scorecard' : 'Resume'}
                      </Button>
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </GlassCard>
      </div>
    </div>
  )
}
