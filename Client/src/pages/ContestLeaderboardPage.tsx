import { useState, useEffect, useRef } from 'react'
import { useParams, Link } from 'react-router'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Trophy,
  Medal,
  Flame,
  Loader2,
  ChevronLeft,
  ArrowUpRight,
  AlertCircle,
  RefreshCw,
  Clock3,
} from 'lucide-react'
import { Badge, Button, GlassCard } from '../components/ui'
import { getContestLeaderboard, getContestById, type ContestDetail } from '../api/contests'
import { useSocket } from '../hooks/useSocket'
import { useAuthStore } from '../store/authStore'
import type { LeaderboardEntry, LeaderboardUpdatePayload } from '../types/socket'
import { cn } from '../lib/cn'

interface EnhancedLeaderboardEntry extends LeaderboardEntry {
  displayTime?: string
  secondaryTime?: string
}

function formatElapsed(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds))
  const hours = Math.floor(safeSeconds / 3600)
  const minutes = Math.floor((safeSeconds % 3600) / 60)
  const seconds = safeSeconds % 60
  if (hours > 0) {
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  }
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

function formatSubmissionTime(
  lastSubmissionTime: string | undefined,
  contestStartMs: number | null
): { displayTime: string; secondaryTime: string } {
  if (!lastSubmissionTime) {
    return { displayTime: '—', secondaryTime: '' }
  }

  const submissionDate = new Date(lastSubmissionTime)
  if (Number.isNaN(submissionDate.getTime())) {
    return { displayTime: lastSubmissionTime, secondaryTime: '' }
  }

  const localClock = submissionDate.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })

  if (contestStartMs === null || Number.isNaN(contestStartMs)) {
    return { displayTime: localClock, secondaryTime: '' }
  }

  const elapsedSeconds = Math.max(
    0,
    Math.floor((submissionDate.getTime() - contestStartMs) / 1000)
  )

  return {
    displayTime: `+${formatElapsed(elapsedSeconds)}`,
    secondaryTime: localClock,
  }
}

function toEnhancedEntry(
  entry: LeaderboardEntry,
  contestStartMs: number | null
): EnhancedLeaderboardEntry {
  const { displayTime, secondaryTime } = formatSubmissionTime(
    entry.lastSubmissionTime,
    contestStartMs
  )
  return {
    ...entry,
    problemsSolved: entry.problemsSolved ?? 0,
    displayTime,
    secondaryTime,
  }
}

export default function ContestLeaderboardPage() {
  const { id: contestId } = useParams<{ id: string }>()
  const currentUser = useAuthStore((s) => s.user)
  const { joinContest, leaveContest, onLeaderboardUpdate, status: socketStatus } = useSocket()

  const [contest, setContest] = useState<ContestDetail | null>(null)
  const [entries, setEntries] = useState<EnhancedLeaderboardEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date())
  const [reloadKey, setReloadKey] = useState(0)

  const [contestStartMs, setContestStartMs] = useState<number | null>(null)

  // Visibility tracking for sticky bottom card
  const currentUserRowRef = useRef<HTMLTableRowElement | null>(null)
  const [isCurrentUserVisible, setIsCurrentUserVisible] = useState(true)

  // Join contest room for realtime leaderboard events
  useEffect(() => {
    if (!contestId) return

    joinContest(contestId)
    return () => {
      leaveContest(contestId)
    }
  }, [contestId, joinContest, leaveContest])

  // Fetch initial leaderboard and contest info
  useEffect(() => {
    if (!contestId) return

    let cancelled = false

    const loadLeaderboard = async () => {
      setLoading(true)
      setError(null)

      try {
        const [contestResult, leaderboardResult] = await Promise.allSettled([
          getContestById(contestId),
          getContestLeaderboard(contestId, { limit: 100 }),
        ])

        if (cancelled) return

        const contestData =
          contestResult.status === 'fulfilled' ? contestResult.value : null
        const leaderboardData =
          leaderboardResult.status === 'fulfilled' ? leaderboardResult.value : null

        if (!contestData && !leaderboardData) {
          throw new Error(
            contestResult.status === 'rejected' &&
              contestResult.reason instanceof Error
              ? contestResult.reason.message
              : 'Could not load this contest leaderboard.'
          )
        }

        setContest(contestData)

        const startMs = contestData?.startTime
          ? new Date(contestData.startTime).getTime()
          : null
        const safeStartMs =
          startMs !== null && !Number.isNaN(startMs) ? startMs : null
        setContestStartMs(safeStartMs)

        const realEntries: LeaderboardEntry[] = Array.isArray(leaderboardData?.entries)
          ? leaderboardData.entries
          : []

        setEntries(realEntries.map((entry) => toEnhancedEntry(entry, safeStartMs)))
        setLastUpdated(new Date())
      } catch (err: unknown) {
        if (cancelled) return
        setContest(null)
        setEntries([])
        setError(
          err instanceof Error
            ? err.message
            : 'Could not load this contest leaderboard. Please try again.'
        )
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void loadLeaderboard()

    return () => {
      cancelled = true
    }
  }, [contestId, reloadKey])

  // Real-time socket leaderboard updates
  useEffect(() => {
    const unsubscribe = onLeaderboardUpdate((payload: LeaderboardUpdatePayload) => {
      if (payload.contestId === contestId && Array.isArray(payload.entries)) {
        setEntries(
          (payload.entries as LeaderboardEntry[]).map((entry) =>
            toEnhancedEntry(entry, contestStartMs)
          )
        )
        setLastUpdated(new Date())
      }
    })
    return unsubscribe
  }, [contestId, contestStartMs, onLeaderboardUpdate])

  // Track if current user's row is visible in viewport
  useEffect(() => {
    const el = currentUserRowRef.current
    if (!el) {
      setIsCurrentUserVisible(false)
      return
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsCurrentUserVisible(entry.isIntersecting)
      },
      { threshold: 0.1 }
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [entries])

  const totalContestProblems =
    contest?.problemCount ?? contest?.problems?.length ?? 0

  const currentUserEntry = currentUser?.id
    ? entries.find((entry) => entry.userId === currentUser.id)
    : undefined

  const scrollToMyRow = () => {
    currentUserRowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  const getRankBadge = (rank: number) => {
    if (rank === 1) {
      return (
        <span className="flex size-7 items-center justify-center rounded-full border border-yellow-500/40 bg-yellow-500/20 font-bold text-yellow-400 shadow-[0_0_12px_rgba(234,179,8,0.3)]">
          <Medal className="size-4" />
        </span>
      )
    }
    if (rank === 2) {
      return (
        <span className="flex size-7 items-center justify-center rounded-full border border-slate-300/40 bg-slate-300/20 font-bold text-slate-200">
          <Medal className="size-4" />
        </span>
      )
    }
    if (rank === 3) {
      return (
        <span className="flex size-7 items-center justify-center rounded-full border border-amber-600/40 bg-amber-700/20 font-bold text-amber-400">
          <Medal className="size-4" />
        </span>
      )
    }
    return (
      <span className="w-7 text-center font-mono text-sm font-semibold text-muted">
        #{rank}
      </span>
    )
  }

  const renderSolvedCount = (solvedCount: number) => (
    <span className="inline-flex items-center justify-center rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-xs">
      <span className="font-bold text-ink">{solvedCount}</span>
      {totalContestProblems > 0 && (
        <span className="ml-1 text-[11px] text-muted/60">
          / {totalContestProblems}
        </span>
      )}
    </span>
  )

  return (
    <div className="flex flex-col gap-6 pb-24 sm:gap-8">
      {/* Header */}
      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            to={contestId ? `/contests/${contestId}` : '/contests'}
            className="flex items-center gap-1.5 text-xs text-muted transition-colors hover:text-ink"
          >
            <ChevronLeft className="size-4" />
            Back to Contest Arena
          </Link>

          <div className="flex items-center gap-2">
            <span
              className={cn(
                'size-2 rounded-full',
                socketStatus === 'connected'
                  ? 'bg-ok shadow-[0_0_8px_#34D399]'
                  : 'bg-warn animate-pulse'
              )}
            />
            <span className="text-xs font-mono text-muted">
              {socketStatus === 'connected' ? 'Live Socket Realtime' : 'Realtime Standings'}
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-ctl border border-white/10 bg-white/5 text-cyan shadow-glow-cyan">
              <Trophy className="size-6 text-cyan" />
            </div>
            <div className="min-w-0">
              <h1 className="break-words text-2xl font-bold tracking-tight sm:text-3xl">
                {contest?.title || 'Contest Leaderboard'}
              </h1>
              <p className="mt-0.5 text-xs font-mono text-muted">
                Standings refreshed: {lastUpdated.toLocaleTimeString()}
              </p>
            </div>
          </div>

          {contest?.status === 'live' && (
            <Badge tone="ok" className="self-start md:self-auto">
              <Flame className="size-3.5 fill-ok animate-pulse" />
              Live Round
            </Badge>
          )}

          {contest?.status === 'ended' && (
            <Badge tone="bad" className="self-start md:self-auto">
              Contest Ended
            </Badge>
          )}
        </div>
      </section>

      {/* Leaderboard Content */}
      {loading ? (
        <div className="flex h-56 flex-col items-center justify-center gap-3 text-muted">
          <Loader2 className="size-6 animate-spin text-cyan" />
          <p className="text-xs font-mono">Synchronizing standings...</p>
        </div>
      ) : error ? (
        <GlassCard className="flex flex-col items-center justify-center gap-3 border-bad/30 bg-bad/5 py-12 text-center">
          <AlertCircle className="size-9 text-bad" />
          <div>
            <h2 className="text-lg font-semibold text-ink">Leaderboard unavailable</h2>
            <p className="mt-1 text-sm text-muted">{error}</p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            leftIcon={<RefreshCw className="size-4" />}
            onClick={() => setReloadKey((key) => key + 1)}
          >
            Retry
          </Button>
        </GlassCard>
      ) : entries.length === 0 ? (
        <GlassCard className="flex flex-col items-center justify-center gap-3 px-4 py-14 text-center">
          <Clock3 className="size-10 text-muted/40" />
          <div>
            <h2 className="text-lg font-semibold text-ink">No submissions yet</h2>
            <p className="mt-1 max-w-md text-sm text-muted">
              The leaderboard will populate automatically as participants submit accepted
              solutions. Solved counts and finish times are calculated from real contest
              submissions.
            </p>
          </div>
          <Link to={contestId ? `/contests/${contestId}` : '/contests'}>
            <Button variant="secondary" size="sm">
              Open Contest Arena
            </Button>
          </Link>
        </GlassCard>
      ) : (
        <GlassCard padded={false} className="overflow-hidden border-white/10">
          {/* Mobile card list */}
          <div className="divide-y divide-white/5 sm:hidden">
            {entries.map((entry) => {
              const isMe = entry.userId === currentUser?.id
              return (
                <div
                  key={entry.userId}
                  className={cn(
                    'flex flex-col gap-3 p-4',
                    isMe && 'bg-cyan/10 shadow-[inset_3px_0_0_#06B6D4]'
                  )}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2.5">
                      {getRankBadge(entry.rank)}
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-ink">
                          {entry.name}
                          {isMe && (
                            <span className="ml-2 rounded-full bg-cyan/20 px-2 py-0.5 text-[10px] font-mono text-cyan">
                              YOU
                            </span>
                          )}
                        </p>
                        <p className="text-[11px] font-mono text-muted">
                          {entry.score} pts
                        </p>
                      </div>
                    </div>
                    <div className="shrink-0">{renderSolvedCount(entry.problemsSolved ?? 0)}</div>
                  </div>

                  <div className="flex items-end justify-between gap-3 text-xs">
                    <span className="text-muted">Problems solved</span>
                    <div className="text-right font-mono">
                      <span className="font-medium text-ink">{entry.displayTime || '—'}</span>
                      {entry.secondaryTime && (
                        <span className="ml-1 text-[10px] text-muted/70">
                          ({entry.secondaryTime})
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Desktop table */}
          <div className="hidden overflow-x-auto sm:block">
            <table className="w-full min-w-[580px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 bg-white/[0.03] text-xs font-mono uppercase tracking-wider text-muted">
                  <th className="w-16 py-3.5 pl-5 pr-2 sm:pl-6">Rank</th>
                  <th className="px-3 py-3.5 sm:px-4">Participant</th>
                  <th className="px-3 py-3.5 text-center sm:px-4">Problems Solved</th>
                  <th className="px-3 py-3.5 text-right sm:px-4">Score</th>
                  <th className="py-3.5 pl-3 pr-5 text-right sm:pl-4 sm:pr-6">Finish Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                <AnimatePresence>
                  {entries.map((entry) => {
                    const isMe = entry.userId === currentUser?.id
                    const solvedCount = entry.problemsSolved ?? 0

                    return (
                      <motion.tr
                        layout
                        key={entry.userId}
                        ref={isMe ? currentUserRowRef : undefined}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        transition={{ type: 'spring', stiffness: 350, damping: 25 }}
                        className={cn(
                          'transition-colors duration-150',
                          isMe
                            ? 'bg-cyan/10 font-semibold text-ink shadow-[inset_3px_0_0_#06B6D4] hover:bg-cyan/15'
                            : 'text-ink/90 hover:bg-white/[0.04]'
                        )}
                      >
                        <td className="py-4 pl-5 pr-2 sm:pl-6">
                          <div className="flex items-center">{getRankBadge(entry.rank)}</div>
                        </td>

                        <td className="px-3 py-4 sm:px-4">
                          <div className="flex items-center gap-2.5 sm:gap-3">
                            <div className="flex size-8 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/10 text-xs font-bold text-ink">
                              {entry.name.charAt(0).toUpperCase()}
                            </div>
                            <div className="flex min-w-0 flex-col">
                              <span className="flex items-center gap-2 text-xs font-semibold text-ink sm:text-sm">
                                <span className="truncate">{entry.name}</span>
                                {isMe && (
                                  <span className="rounded-full bg-cyan/20 px-2 py-0.5 text-[10px] font-mono text-cyan">
                                    YOU
                                  </span>
                                )}
                              </span>
                            </div>
                          </div>
                        </td>

                        <td className="px-3 py-4 text-center font-mono sm:px-4">
                          {renderSolvedCount(solvedCount)}
                        </td>

                        <td className="px-3 py-4 text-right font-mono text-xs font-bold text-cyan sm:px-4 sm:text-sm">
                          {entry.score} pts
                        </td>

                        <td className="py-4 pl-3 pr-5 text-right font-mono text-xs text-muted sm:pl-4 sm:pr-6">
                          <div className="flex flex-col items-end">
                            <span className="font-medium text-ink">
                              {entry.displayTime || '—'}
                            </span>
                            {entry.secondaryTime && (
                              <span className="text-[10px] text-muted/70">
                                {entry.secondaryTime}
                              </span>
                            )}
                          </div>
                        </td>
                      </motion.tr>
                    )
                  })}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
        </GlassCard>
      )}

      {/* Sticky Bottom Card for Current User if Off-Screen */}
      {currentUserEntry && !isCurrentUserVisible && (
        <div className="fixed inset-x-0 bottom-6 z-40 mx-auto hidden max-w-2xl px-4 lg:block">
          <GlassCard
            strong
            className="flex flex-col items-start justify-between gap-3 border-cyan/40 bg-base/95 p-3.5 shadow-[0_0_30px_rgba(6,182,212,0.25)] sm:flex-row sm:items-center sm:p-4"
          >
            <div className="flex items-center gap-3">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-full border border-cyan/40 bg-cyan/20 font-mono text-sm font-bold text-cyan sm:size-9">
                #{currentUserEntry.rank}
              </div>
              <div className="flex flex-col">
                <span className="text-[11px] font-mono text-muted">Your Current Standings</span>
                <span className="text-xs font-bold text-ink sm:text-sm">
                  {currentUserEntry.score} pts • {currentUserEntry.problemsSolved ?? 0}
                  {totalContestProblems > 0 ? `/${totalContestProblems}` : ''} solved •{' '}
                  {currentUserEntry.displayTime || '—'}
                </span>
              </div>
            </div>

            <Button
              variant="secondary"
              size="sm"
              onClick={scrollToMyRow}
              className="h-8 self-end border-cyan/30 text-xs text-cyan hover:bg-cyan/10 sm:self-auto"
            >
              <ArrowUpRight className="mr-1 size-3.5" />
              Jump to My Row
            </Button>
          </GlassCard>
        </div>
      )}
    </div>
  )
}
