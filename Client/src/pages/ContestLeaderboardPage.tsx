import { useState, useEffect, useRef, useMemo } from 'react'
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

interface EnhancedLeaderboardEntry extends LeaderboardEntry {
  elapsedSeconds?: number
  formattedTime?: string
  displayTime?: string
}

export default function ContestLeaderboardPage() {
  const { id: contestId } = useParams<{ id: string }>()
  const currentUser = useAuthStore((s) => s.user)
  const { joinContest, leaveContest, onLeaderboardUpdate, status: socketStatus } = useSocket()

  const [contest, setContest] = useState<ContestDetail | null>(null)
  const [entries, setEntries] = useState<EnhancedLeaderboardEntry[]>([])
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

  // Helper to format seconds into HH:MM:SS or MM:SS
  const formatElapsed = (totalSeconds: number): string => {
    const hours = Math.floor(totalSeconds / 3600)
    const minutes = Math.floor((totalSeconds % 3600) / 60)
    const seconds = totalSeconds % 60
    if (hours > 0) {
      return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    }
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  }

  // Fetch initial leaderboard and contest info
  useEffect(() => {
    if (!contestId) return
    setLoading(true)

    Promise.all([
      getContestById(contestId).catch(() => null),
      getContestLeaderboard(contestId).catch(() => null),
    ])
      .then(([contestData, lbData]) => {
        if (contestData) {
          setContest(contestData)
        } else {
          // Fallback contest metadata if backend offline
          const now = Date.now()
          setContest({
            id: contestId,
            title: 'MockKernel Weekly Contest 1',
            status: 'live',
            startTime: new Date(now - 1000 * 60 * 35).toISOString(),
            endTime: new Date(now + 1000 * 60 * 85).toISOString(),
            problemCount: 4,
            participantCount: 142,
            problems: [
              { problem: { id: 'two-sum', title: 'Two Sum', difficulty: 'Easy' }, points: 100, order: 0 },
              { problem: { id: 'valid-parentheses', title: 'Valid Parentheses', difficulty: 'Easy' }, points: 200, order: 1 },
              { problem: { id: 'lru-cache', title: 'LRU Cache', difficulty: 'Medium' }, points: 300, order: 2 },
              { problem: { id: 'merge-k-lists', title: 'Merge k Sorted Lists', difficulty: 'Hard' }, points: 400, order: 3 },
            ],
          })
        }

        const startTimestamp = contestData?.startTime
          ? new Date(contestData.startTime).getTime()
          : Date.now() - 1000 * 60 * 35

        if (lbData?.entries && lbData.entries.length > 0) {
          const formatted = lbData.entries.map((e: LeaderboardEntry) => {
            // If backend provides raw lastSubmissionTime, format or calculate elapsed
            let timeStr = e.lastSubmissionTime || ''
            if (e.lastSubmissionTime && e.lastSubmissionTime.includes('T')) {
              const subDate = new Date(e.lastSubmissionTime)
              const diffSec = Math.max(0, Math.floor((subDate.getTime() - startTimestamp) / 1000))
              timeStr = `+${formatElapsed(diffSec)}`
            }
            return {
              ...e,
              problemsSolved: e.problemsSolved ?? 0,
              displayTime: timeStr || '—',
            }
          })
          setEntries(formatted)
        } else {
          // Dynamic, mathematically coherent mock standings calculated from contest start time
          // Contest started at startTimestamp; each participant finished within that time window
          const mockStandings = [
            {
              rank: 1,
              userId: 'u-1',
              name: 'Alex Chen',
              score: 1000,
              problemsSolved: 4,
              elapsedSeconds: 1104, // 18m 24s
            },
            {
              rank: 2,
              userId: 'u-2',
              name: 'Sophia Williams',
              score: 600,
              problemsSolved: 3,
              elapsedSeconds: 1485, // 24m 45s
            },
            {
              rank: 3,
              userId: 'u-3',
              name: 'Devin Vance',
              score: 600,
              problemsSolved: 3,
              elapsedSeconds: 1840, // 30m 40s
            },
            {
              rank: 4,
              userId: currentUser?.id || 'current-user-mock',
              name: currentUser?.name ? `${currentUser.name} (You)` : 'You (Current User)',
              score: 300,
              problemsSolved: 2,
              elapsedSeconds: 1290, // 21m 30s
            },
            {
              rank: 5,
              userId: 'u-5',
              name: 'Rohan Sharma',
              score: 300,
              problemsSolved: 2,
              elapsedSeconds: 1650, // 27m 30s
            },
            {
              rank: 6,
              userId: 'u-6',
              name: 'Elena Rostova',
              score: 300,
              problemsSolved: 2,
              elapsedSeconds: 1910, // 31m 50s
            },
            {
              rank: 7,
              userId: 'u-7',
              name: 'Marcus Brody',
              score: 100,
              problemsSolved: 1,
              elapsedSeconds: 890, // 14m 50s
            },
          ]

          const formattedMock: EnhancedLeaderboardEntry[] = mockStandings.map((s) => {
            const subDate = new Date(startTimestamp + s.elapsedSeconds * 1000)
            const localClock = subDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            const elapsedStr = `+${formatElapsed(s.elapsedSeconds)}`

            return {
              rank: s.rank,
              userId: s.userId,
              name: s.name,
              score: s.score,
              problemsSolved: s.problemsSolved,
              elapsedSeconds: s.elapsedSeconds,
              lastSubmissionTime: localClock,
              displayTime: `${elapsedStr} (${localClock})`,
            }
          })

          setEntries(formattedMock)
        }
      })
      .finally(() => setLoading(false))
  }, [contestId, currentUser])

  // Real-time socket leaderboard updates
  useEffect(() => {
    const unsubscribe = onLeaderboardUpdate((payload: LeaderboardUpdatePayload) => {
      if (payload.contestId === contestId && payload.entries) {
        setEntries(payload.entries as EnhancedLeaderboardEntry[])
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

  const totalContestProblems = contest?.problemCount || 4

  const currentUserEntry = useMemo(() => {
    return entries.find(
      (e) =>
        e.userId === currentUser?.id ||
        (currentUser && e.name.toLowerCase().includes(currentUser.name.toLowerCase())) ||
        e.name.includes('(You)')
    )
  }, [entries, currentUser])

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
              {socketStatus === 'connected' ? 'Live Socket Realtime' : 'Realtime Standings'}
            </span>
          </div>
        </div>

        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-ctl bg-white/5 border border-white/10 text-cyan shadow-glow-cyan shrink-0">
              <Trophy className="size-6 text-cyan" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
                {contest?.title || 'Contest Leaderboard'}
              </h1>
              <p className="text-xs text-muted font-mono mt-0.5">
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
        </div>
      </section>

      {/* Leaderboard Table Container */}
      {loading ? (
        <div className="flex h-56 flex-col items-center justify-center gap-3 text-muted">
          <Loader2 className="size-6 animate-spin text-cyan" />
          <p className="text-xs font-mono">Synchronizing standings...</p>
        </div>
      ) : (
        <GlassCard padded={false} className="overflow-hidden border-white/10">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm min-w-[580px]">
              <thead>
                <tr className="border-b border-white/10 bg-white/[0.03] text-xs font-mono text-muted uppercase tracking-wider">
                  <th className="py-3.5 pl-5 sm:pl-6 pr-2 w-16">Rank</th>
                  <th className="py-3.5 px-3 sm:px-4">Participant</th>
                  <th className="py-3.5 px-3 sm:px-4 text-center">Problems Solved</th>
                  <th className="py-3.5 px-3 sm:px-4 text-right">Score</th>
                  <th className="py-3.5 pr-5 sm:pr-6 pl-3 sm:pl-4 text-right">Finish Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                <AnimatePresence>
                  {entries.map((entry) => {
                    const isMe =
                      entry.userId === currentUser?.id ||
                      (currentUser &&
                        entry.name.toLowerCase().includes(currentUser.name.toLowerCase())) ||
                      entry.name.includes('(You)')

                    const solvedCount = entry.problemsSolved ?? 0

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
                        <td className="py-4 pl-5 sm:pl-6 pr-2">
                          <div className="flex items-center">{getRankBadge(entry.rank)}</div>
                        </td>

                        {/* Name */}
                        <td className="py-4 px-3 sm:px-4">
                          <div className="flex items-center gap-2.5 sm:gap-3">
                            <div className="flex size-8 items-center justify-center rounded-full bg-white/10 border border-white/10 text-xs font-bold text-ink shrink-0">
                              {entry.name.charAt(0).toUpperCase()}
                            </div>
                            <div className="flex flex-col">
                              <span className="font-semibold text-ink flex items-center gap-2 text-xs sm:text-sm">
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
                        <td className="py-4 px-3 sm:px-4 text-center font-mono">
                          <span className="inline-flex items-center justify-center px-2.5 py-0.5 rounded-full bg-white/5 text-xs border border-white/10">
                            <span className="font-bold text-ink">{solvedCount}</span>
                            <span className="text-muted/60 text-[11px] ml-1">/ {totalContestProblems}</span>
                          </span>
                        </td>

                        {/* Score */}
                        <td className="py-4 px-3 sm:px-4 text-right font-mono text-cyan font-bold text-xs sm:text-sm">
                          {entry.score} pts
                        </td>

                        {/* Finish / Last Submission Time */}
                        <td className="py-4 pr-5 sm:pr-6 pl-3 sm:pl-4 text-right font-mono text-xs text-muted">
                          <div className="flex flex-col items-end">
                            <span className="text-ink font-medium">
                              {entry.displayTime || (entry.lastSubmissionTime ? entry.lastSubmissionTime : '—')}
                            </span>
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
        <div className="fixed bottom-6 inset-x-0 mx-auto max-w-2xl px-4 z-40">
          <GlassCard
            strong
            className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-cyan/40 bg-base/95 shadow-[0_0_30px_rgba(6,182,212,0.25)] p-3.5 sm:p-4"
          >
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center size-8 sm:size-9 rounded-full bg-cyan/20 border border-cyan/40 text-cyan font-bold font-mono text-sm shrink-0">
                #{currentUserEntry.rank}
              </div>
              <div className="flex flex-col">
                <span className="text-[11px] text-muted font-mono">Your Current Standings</span>
                <span className="text-xs sm:text-sm font-bold text-ink">
                  {currentUserEntry.score} pts • {currentUserEntry.problemsSolved ?? 0}/{totalContestProblems} solved • {currentUserEntry.displayTime || currentUserEntry.lastSubmissionTime || '—'}
                </span>
              </div>
            </div>

            <Button
              variant="secondary"
              size="sm"
              onClick={scrollToMyRow}
              className="text-xs border-cyan/30 text-cyan hover:bg-cyan/10 self-end sm:self-auto h-8"
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
