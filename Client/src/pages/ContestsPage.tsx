import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router'
import {
  Trophy,
  Users,
  Code2,
  Calendar,
  ArrowRight,
  Loader2,
  Flame,
} from 'lucide-react'
import { Badge, Button, GlassCard, Timer } from '../components/ui'
import {
  getContests,
  joinContest,
  type ContestSummary,
} from '../api/contests'
import { useAuthStore } from '../store/authStore'
import { cn } from '../lib/cn'

export default function ContestsPage() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const [filter, setFilter] = useState<'all' | 'live' | 'ended'>('all')
  const [contests, setContests] = useState<ContestSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [joiningId, setJoiningId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const fetchContestList = () => {
    setLoading(true)
    getContests({
      status: filter === 'all' ? undefined : (filter as 'live' | 'ended'),
    })
      .then((res) => {
        if (res?.data) {
          setContests(res.data)
        }
      })
      .catch(() => {
        // Mock fallback if backend has no live contests seeded yet
        const now = Date.now()
        setContests([
          {
            id: 'mock-weekly-1',
            title: 'MockKernel Weekly Contest 1',
            description:
              'Test your algorithmic speed on 4 fresh problems ranging from easy to hard.',
            status: 'live',
            startTime: new Date(now - 1000 * 60 * 30).toISOString(),
            endTime: new Date(now + 1000 * 60 * 90).toISOString(),
            problemCount: 4,
            participantCount: 142,
            hasJoined: false,
          },
          {
            id: 'mock-biweekly-1',
            title: 'MockKernel Bi-Weekly Clash',
            description:
              'Competitive arena with real-time scoring, strict test cases, and anti-plagiarism guardrails.',
            status: 'ended',
            startTime: new Date(now - 1000 * 60 * 60 * 48).toISOString(),
            endTime: new Date(now - 1000 * 60 * 60 * 46).toISOString(),
            problemCount: 3,
            participantCount: 310,
            hasJoined: true,
          },
        ])
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    fetchContestList()
  }, [filter])

  const handleJoin = async (contestId: string) => {
    if (!user) {
      navigate('/login')
      return
    }

    setJoiningId(contestId)
    setActionError(null)

    try {
      await joinContest(contestId)
      // Navigate straight to the live arena
      navigate(`/contests/${contestId}`)
    } catch (err: any) {
      setActionError(err?.message || 'Could not join contest')
    } finally {
      setJoiningId(null)
    }
  }

  return (
    <div className="flex flex-col gap-10">
      {/* Hero section */}
      <section className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-ctl bg-white/5 border border-white/10 text-cyan shadow-glow-cyan">
            <Trophy className="size-6" />
          </div>
          <div>
            <h1 className="text-4xl font-bold tracking-tight">Competitive Contests</h1>
            <p className="text-muted">
              Compete live, climb the realtime leaderboard, and sharpen your coding speed.
            </p>
          </div>
        </div>

        {/* Filter Switcher */}
        <div className="flex items-center gap-2 pt-2" role="tablist">
          {(['all', 'live', 'ended'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setFilter(tab)}
              className={cn(
                'rounded-full px-4 py-1.5 text-xs font-semibold uppercase tracking-wider transition-all',
                filter === tab
                  ? 'bg-cyan/20 text-cyan border border-cyan/40 shadow-glow-cyan'
                  : 'bg-white/5 text-muted hover:bg-white/10 hover:text-ink border border-white/5'
              )}
            >
              {tab === 'all' ? 'All Contests' : tab === 'live' ? '🔥 Live Now' : 'Past Contests'}
            </button>
          ))}
        </div>
      </section>

      {actionError && (
        <div className="rounded-card border border-bad/30 bg-bad/10 p-4 text-xs font-mono text-bad">
          {actionError}
        </div>
      )}

      {/* Contests List */}
      {loading ? (
        <div className="flex h-48 flex-col items-center justify-center gap-3 text-muted">
          <Loader2 className="size-6 animate-spin text-cyan" />
          <p className="text-xs font-mono">Fetching contest arena...</p>
        </div>
      ) : contests.length === 0 ? (
        <GlassCard className="flex flex-col items-center justify-center py-16 text-center text-muted">
          <Trophy className="size-12 text-muted/40 mb-3" />
          <h3 className="text-lg font-semibold text-ink">No contests found</h3>
          <p className="text-sm mt-1">Check back soon for upcoming tournaments and challenges.</p>
        </GlassCard>
      ) : (
        <ul className="flex flex-col gap-5">
          {contests.map((c) => {
            const isLive = c.status === 'live'
            return (
              <li key={c.id}>
                <GlassCard
                  strong={isLive}
                  className={cn(
                    'relative overflow-hidden transition-all duration-200 border-white/10',
                    isLive && 'border-cyan/30 shadow-[0_0_24px_rgba(6,182,212,0.12)]'
                  )}
                >
                  <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                    {/* Left Info */}
                    <div className="flex flex-col gap-3 max-w-2xl">
                      <div className="flex flex-wrap items-center gap-3">
                        {isLive ? (
                          <span className="flex items-center gap-1.5 rounded-full bg-cyan/15 px-3 py-0.5 text-xs font-semibold text-cyan border border-cyan/30">
                            <Flame className="size-3.5 fill-cyan animate-pulse" />
                            LIVE CONTEST
                          </span>
                        ) : (
                          <Badge tone="bad">ENDED</Badge>
                        )}
                        <h2 className="text-xl font-bold text-ink">{c.title}</h2>
                      </div>

                      {c.description && (
                        <p className="text-sm text-muted leading-relaxed">{c.description}</p>
                      )}

                      {/* Meta badges */}
                      <div className="flex flex-wrap items-center gap-5 text-xs font-mono text-muted">
                        <div className="flex items-center gap-1.5">
                          <Code2 className="size-4 text-cyan" />
                          <span>{c.problemCount} Problems</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Users className="size-4 text-cyan" />
                          <span>{c.participantCount} Participants</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Calendar className="size-4 text-muted" />
                          <span>{new Date(c.startTime).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                      </div>
                    </div>

                    {/* Right Action & Timer */}
                    <div className="flex flex-col items-start gap-4 lg:items-end">
                      {isLive && (
                        <div className="flex flex-col items-start lg:items-end gap-1">
                          <span className="text-[11px] font-mono text-muted uppercase">
                            Time Remaining
                          </span>
                          <Timer targetTime={c.endTime} size="md" />
                        </div>
                      )}

                      <div className="flex items-center gap-3">
                        <Link to={`/contests/${c.id}/leaderboard`}>
                          <Button variant="secondary" size="sm" className="h-10 text-xs">
                            <Trophy className="size-3.5 mr-1 text-cyan" />
                            Leaderboard
                          </Button>
                        </Link>

                        {isLive ? (
                          c.hasJoined ? (
                            <Link to={`/contests/${c.id}`}>
                              <Button size="sm" className="h-10 text-xs bg-brand font-semibold shadow-glow">
                                <ArrowRight className="size-4 mr-1" />
                                Enter Arena
                              </Button>
                            </Link>
                          ) : (
                            <Button
                              size="sm"
                              className="h-10 text-xs bg-brand font-semibold shadow-glow"
                              onClick={() => handleJoin(c.id)}
                              loading={joiningId === c.id}
                            >
                              Join Contest
                            </Button>
                          )
                        ) : (
                          <Link to={`/contests/${c.id}/leaderboard`}>
                            <Button variant="secondary" size="sm" className="h-10 text-xs">
                              View Results
                            </Button>
                          </Link>
                        )}
                      </div>
                    </div>
                  </div>
                </GlassCard>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
