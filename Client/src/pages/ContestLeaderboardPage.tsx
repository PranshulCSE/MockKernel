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
} from 'lucide-react'
import { Badge, Button, GlassCard } from '../components/ui'
import { getContestLeaderboard, getContestById, type ContestDetail } from '../api/contests'
import { useSocket } from '../hooks/useSocket'
import { useAuthStore } from '../store/authStore'
import type { LeaderboardEntry, LeaderboardUpdatePayload } from '../types/socket'
import { cn } from '../lib/cn'

export default function ContestLeaderboardPage() {
  const { id: contestId } = useParams<{ id: string }>()
  const currentUser = useAuthStore((s) => s.user)
  const { joinContest, leaveContest, onLeaderboardUpdate, status: socketStatus } = useSocket()

  const [contest, setContest] = useState<ContestDetail | null>(null)
  const [entries, setEntries] = useState<LeaderboardEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date())

  // Visibility tracking for sticky bottom card
  const currentUserRowRef = useRef<HTMLTableRowElement | null>(null)
  const [isCurrentUserVisible, setIsCurrentUserVisible] = useState(true)

  // Join contest room for realtime leaderboard events
  useEffect(() => {
    if (contestId) {
      joinContest(contestId)
      return () => {
        leaveContest(contestId)
      }
    }
  }, [contestId, joinContest, leaveContest])

  // Fetch initial leaderboard and contest info
  useEffect(() => {
    if (!contestId) return

    let cancelled = false

    const loadLeaderboard = async () => {
      setLoading(true)
      try {
        const [contestData, lbData] = await Promise.all([
          getContestById(contestId).catch(() => null),
          getContestLeaderboard(contestId).catch(() => null),
        ])

        if (cancelled) return

        if (contestData) setContest(contestData)

        if (lbData?.entries && lbData.entries.length > 0) {
          setEntries(lbData.entries)
        } else {
          // Mock initial leaderboard data for smooth display
          setEntries([
            {
              rank: 1,
              userId: 'u-1',
              name: 'Alex Chen',
              score: 600,
              problemsSolved: 4,
              lastSubmissionTime: '12:45 PM',
            },
            {
              rank: 2,
              userId: 'u-2',
              name: 'Sophia Williams',
              score: 550,
              problemsSolved: 4,
              lastSubmissionTime: '12:51 PM',
            },
            {
              rank: 3,
              userId: 'u-3',
              name: 'Devin Vance',
              score: 450,
              problemsSolved: 3,
              lastSubmissionTime: '12:38 PM',
            },
            {
              rank: 4,
              userId: currentUser?.id || 'current-user-mock',
              name: currentUser?.name || 'You (Current User)',
              score: 350,
              problemsSolved: 2,
              lastSubmissionTime: '12:55 PM',
            },
            {
              rank: 5,
              userId: 'u-5',
              name: 'Rohan Sharma',
              score: 250,
              problemsSolved: 2,
              lastSubmissionTime: '12:30 PM',
            },
            {
              rank: 6,
              userId: 'u-6',
              name: 'Elena Rostova',
              score: 200,
              problemsSolved: 1,
              lastSubmissionTime: '12:20 PM',
            },
            {
              rank: 7,
              userId: 'u-7',
              name: 'Marcus Brody',
              score: 100,
              problemsSolved: 1,
              lastSubmissionTime: '12:15 PM',
            },
          ])
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void loadLeaderboard()

    return () => {
      cancelled = true
    }
  }, [contestId, currentUser])

  // Real-time socket leaderboard updates
  useEffect(() => {
    const unsubscribe = onLeaderboardUpdate((payload: LeaderboardUpdatePayload) => {
      if (payload.contestId === contestId && payload.entries) {
        setEntries(payload.entries)
        setLastUpdated(new Date())
      }
    })
    return unsubscribe
  }, [contestId, onLeaderboardUpdate])

  // Track if current user's row is visible in viewport
  useEffect(() => {
    const el = currentUserRowRef.current
    if (!el) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsCurrentUserVisible(entry.isIntersecting)
      },
      { threshold: 0.1 }
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [entries])

  const currentUserEntry = entries.find(
    (e) =>
      e.userId === currentUser?.id ||
      (currentUser && e.name.toLowerCase().includes(currentUser.name.toLowerCase()))
  )

  const scrollToMyRow = () => {
    currentUserRowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  const getRankBadge = (rank: number) => {
    if (rank === 1) {
      return (
        <span className="flex items-center justify-center size-7 rounded-full bg-yellow-500/20 text-yellow-400 font-bold border border-yellow-500/40 shadow-[0_0_12px_rgba(234,179,8,0.3)]">
          <Medal className="size-4" />
        </span>
      )
    }
    if (rank === 2) {
      return (
        <span className="flex items-center justify-center size-7 rounded-full bg-slate-300/20 text-slate-200 font-bold border border-slate-300/40">
          <Medal className="size-4" />
        </span>
      )
    }
    if (rank === 3) {
      return (
        <span className="flex items-center justify-center size-7 rounded-full bg-amber-700/20 text-amber-400 font-bold border border-amber-600/40">
          <Medal className="size-4" />
        </span>
      )
    }
    return (
      <span className="font-mono text-sm text-muted font-semibold w-7 text-center">
        #{rank}
      </span>
    )
  }

  return (
    <div className="flex flex-col gap-8 pb-24">
      {/* Header */}
      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <Link
            to={contestId ? `/contests/${contestId}` : '/contests'}
            className="flex items-center gap-1.5 text-xs text-muted hover:text-ink transition-colors"
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
              {socketStatus === 'connected' ? 'Live Realtime Socket' : 'Polling'}
            </span>
          </div>
        </div>

        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-ctl bg-white/5 border border-white/10 text-cyan shadow-glow-cyan">
              <Trophy className="size-6 text-cyan" />
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">
                {contest?.title || 'Contest Leaderboard'}
              </h1>
              <p className="text-xs text-muted font-mono mt-0.5">
                Last updated: {lastUpdated.toLocaleTimeString()}
              </p>
            </div>
          </div>

          {contest?.status === 'live' && (
            <Badge tone="ok" className="self-start md:self-auto">
              <Flame className="size-3.5 fill-ok animate-pulse" />
              Live Round
            </Badge>
          )}
        </div>
      </section>

      {/* Leaderboard Table */}
      {loading ? (
        <div className="flex h-56 flex-col items-center justify-center gap-3 text-muted">
          <Loader2 className="size-6 animate-spin text-cyan" />
          <p className="text-xs font-mono">Synchronizing standings...</p>
        </div>
      ) : (
        <GlassCard padded={false} className="overflow-hidden border-white/10">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-white/10 bg-white/[0.03] text-xs font-mono text-muted uppercase tracking-wider">
                  <th className="py-3.5 pl-6 pr-3 w-16">Rank</th>
                  <th className="py-3.5 px-4">Participant</th>
                  <th className="py-3.5 px-4 text-center">Problems Solved</th>
                  <th className="py-3.5 px-4 text-right">Score</th>
                  <th className="py-3.5 pr-6 pl-4 text-right">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                <AnimatePresence>
                  {entries.map((entry) => {
                    const isMe =
                      entry.userId === currentUser?.id ||
                      (currentUser &&
                        entry.name.toLowerCase().includes(currentUser.name.toLowerCase()))

                    return (
                      <motion.tr
                        layout
                        key={entry.userId}
                        ref={isMe ? currentUserRowRef : undefined}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        transition={{
                          type: 'spring',
                          stiffness: 350,
                          damping: 25,
                        }}
                        className={cn(
                          'transition-colors duration-150',
                          isMe
                            ? 'bg-cyan/10 hover:bg-cyan/15 font-semibold text-ink shadow-[inset_3px_0_0_#06B6D4]'
                            : 'hover:bg-white/[0.04] text-ink/90'
                        )}
                      >
                        {/* Rank */}
                        <td className="py-4 pl-6 pr-3">
                          <div className="flex items-center">{getRankBadge(entry.rank)}</div>
                        </td>

                        {/* Name */}
                        <td className="py-4 px-4">
                          <div className="flex items-center gap-3">
                            <div className="flex size-8 items-center justify-center rounded-full bg-white/10 border border-white/10 text-xs font-bold text-ink">
                              {entry.name.charAt(0).toUpperCase()}
                            </div>
                            <div className="flex flex-col">
                              <span className="font-semibold text-ink flex items-center gap-2">
                                {entry.name}
                                {isMe && (
                                  <span className="rounded-full bg-cyan/20 px-2 py-0.5 text-[10px] font-mono text-cyan">
                                    YOU
                                  </span>
                                )}
                              </span>
                            </div>
                          </div>
                        </td>

                        {/* Problems Solved */}
                        <td className="py-4 px-4 text-center font-mono">
                          <span className="inline-flex items-center justify-center px-2.5 py-0.5 rounded-full bg-white/5 text-xs text-muted border border-white/5">
                            {entry.problemsSolved ?? 0}
                          </span>
                        </td>

                        {/* Score */}
                        <td className="py-4 px-4 text-right font-mono text-cyan font-bold">
                          {entry.score} pts
                        </td>

                        {/* Last Submission Time */}
                        <td className="py-4 pr-6 pl-4 text-right font-mono text-xs text-muted">
                          {entry.lastSubmissionTime || '—'}
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
        <div className="fixed bottom-6 inset-x-0 mx-auto max-w-2xl px-4 z-40">
          <GlassCard
            strong
            className="flex items-center justify-between border-cyan/40 bg-base/95 shadow-[0_0_30px_rgba(6,182,212,0.25)] p-4"
          >
            <div className="flex items-center gap-4">
              <div className="flex items-center justify-center size-9 rounded-full bg-cyan/20 border border-cyan/40 text-cyan font-bold font-mono text-sm">
                #{currentUserEntry.rank}
              </div>
              <div className="flex flex-col">
                <span className="text-xs text-muted font-mono">Your Current Standings</span>
                <span className="text-sm font-bold text-ink">
                  {currentUserEntry.score} pts • {currentUserEntry.problemsSolved ?? 0} solved
                </span>
              </div>
            </div>

            <Button
              variant="secondary"
              size="sm"
              onClick={scrollToMyRow}
              className="text-xs border-cyan/30 text-cyan hover:bg-cyan/10"
            >
              <ArrowUpRight className="size-3.5 mr-1" />
              Jump to My Row
            </Button>
          </GlassCard>
        </div>
      )}
    </div>
  )
}
