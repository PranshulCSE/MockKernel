import { useEffect, useRef, useState, useCallback } from 'react'
import { io, Socket } from 'socket.io-client'
import { useAuthStore } from '../store/authStore'
import type {
  SocketStatus,
  VerdictUpdatePayload,
  LeaderboardUpdatePayload,
  UserStatsUpdatePayload,
  AdminUsersUpdatePayload,
} from '../types/socket'
import type { Verdict } from '../types/verdict'

const API_BASE_URL =
  (import.meta as { env?: { VITE_API_URL?: string } }).env?.VITE_API_URL ||
  'http://localhost:3000'

const TERMINAL_VERDICTS: Verdict[] = [
  'ACCEPTED',
  'WRONG_ANSWER',
  'TLE',
  'RUNTIME_ERROR',
  'COMPILE_ERROR',
  'INTERNAL_ERROR',
  'PLAGIARISM_FLAGGED',
]

export function useSocket() {
  const socketRef = useRef<Socket | null>(null)
  const [status, setStatus] = useState<SocketStatus>('disconnected')
  const accessToken = useAuthStore((s) => s.accessToken)

  // Callbacks registry
  const verdictCallbacks = useRef<Set<(data: VerdictUpdatePayload) => void>>(new Set())
  const leaderboardCallbacks = useRef<Set<(data: LeaderboardUpdatePayload) => void>>(new Set())
  const userStatsCallbacks = useRef<Set<(data: UserStatsUpdatePayload) => void>>(new Set())
  const adminUsersCallbacks = useRef<Set<(data: AdminUsersUpdatePayload) => void>>(new Set())

  // Active tracking registry for polling fallback: submissionId -> callback
  const pendingSubmissions = useRef<Map<string, (data: VerdictUpdatePayload) => void>>(new Map())
  const pollingTimers = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map())

  // Stop polling for a submission
  const stopPolling = useCallback((submissionId: string) => {
    const timer = pollingTimers.current.get(submissionId)
    if (timer) {
      clearInterval(timer)
      pollingTimers.current.delete(submissionId)
    }
  }, [])

  // Poll fallback function
  const startPolling = useCallback(
    (submissionId: string, callback: (data: VerdictUpdatePayload) => void) => {
      if (pollingTimers.current.has(submissionId)) return

      setStatus('polling')

      const checkStatus = async () => {
        try {
          const res = await fetch(`${API_BASE_URL}/api/submissions/${submissionId}/status`, {
            headers: {
              ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
            },
          })

          if (!res.ok) return

          const response = (await res.json()) as
            | { data?: VerdictUpdatePayload }
            | VerdictUpdatePayload
          const payload: VerdictUpdatePayload =
            'data' in response && response.data
              ? response.data
              : (response as VerdictUpdatePayload)
          const data = {
            ...payload,
            submissionId: payload.submissionId || submissionId,
          } as VerdictUpdatePayload

          callback(data)
          verdictCallbacks.current.forEach((cb) => cb(data))

          if (TERMINAL_VERDICTS.includes(data.verdict)) {
            stopPolling(submissionId)
            pendingSubmissions.current.delete(submissionId)

            // If no more pending submissions being polled, restore connection state
            if (pollingTimers.current.size === 0) {
              setStatus(socketRef.current?.connected ? 'connected' : 'reconnecting')
            }
          }
        } catch {
          // ignore network poll errors and retry next tick
        }
      }

      // Immediate first check
      checkStatus()
      const timer = setInterval(checkStatus, 1500)
      pollingTimers.current.set(submissionId, timer)
    },
    [accessToken, stopPolling]
  )

  // Polling also closes the race where a very fast submission finishes before
  // the client receives its ID and registers the socket callback.
  const trackSubmission = useCallback(
    (submissionId: string, onUpdate: (data: VerdictUpdatePayload) => void) => {
      pendingSubmissions.current.set(submissionId, onUpdate)
      startPolling(submissionId, onUpdate)
    },
    [startPolling]
  )

  useEffect(() => {
    const socket = io(API_BASE_URL, {
      auth: { token: accessToken || '' },
      transports: ['websocket', 'polling'],
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
    })

    socketRef.current = socket

    socket.on('connect', () => {
      // If we are currently polling, stay on 'polling' until done, otherwise 'connected'
      if (pollingTimers.current.size === 0) {
        setStatus('connected')
      }
    })

    socket.on('disconnect', () => {
      setStatus('reconnecting')

      // Socket dropped: trigger polling fallback for any pending submission
      pendingSubmissions.current.forEach((cb, subId) => {
        startPolling(subId, cb)
      })
    })

    socket.on('connect_error', () => {
      setStatus('reconnecting')

      // Socket error: start fallback polling for active submissions
      pendingSubmissions.current.forEach((cb, subId) => {
        startPolling(subId, cb)
      })
    })

    socket.on('verdict:update', (payload: VerdictUpdatePayload) => {
      verdictCallbacks.current.forEach((cb) => cb(payload))
      userStatsCallbacks.current.forEach((cb) =>
        cb({ reason: 'submission-completed', submissionId: payload.submissionId })
      )

      if (pendingSubmissions.current.has(payload.submissionId)) {
        const handler = pendingSubmissions.current.get(payload.submissionId)
        if (handler) handler(payload)

        if (TERMINAL_VERDICTS.includes(payload.verdict)) {
          stopPolling(payload.submissionId)
          pendingSubmissions.current.delete(payload.submissionId)
        }
      }
    })

    socket.on('leaderboard:update', (payload: LeaderboardUpdatePayload) => {
      leaderboardCallbacks.current.forEach((cb) => cb(payload))
    })

    socket.on('user:stats:update', (payload: UserStatsUpdatePayload) => {
      userStatsCallbacks.current.forEach((cb) => cb(payload))
    })

    socket.on('admin:users:update', (payload: AdminUsersUpdatePayload) => {
      adminUsersCallbacks.current.forEach((cb) => cb(payload))
    })

    const timers = pollingTimers.current

    return () => {
      socket.disconnect()
      socketRef.current = null

      // Clean up all polling timers on unmount
      timers.forEach((timer) => clearInterval(timer))
      timers.clear()
    }
  }, [accessToken, startPolling, stopPolling])

  // Emitters
  const joinContest = useCallback((contestId: string) => {
    socketRef.current?.emit('contest:join', contestId)
  }, [])

  const leaveContest = useCallback((contestId: string) => {
    socketRef.current?.emit('contest:leave', contestId)
  }, [])

  // Listener subscriptions
  const onVerdictUpdate = useCallback((callback: (data: VerdictUpdatePayload) => void) => {
    verdictCallbacks.current.add(callback)
    return () => {
      verdictCallbacks.current.delete(callback)
    }
  }, [])

  const onLeaderboardUpdate = useCallback((callback: (data: LeaderboardUpdatePayload) => void) => {
    leaderboardCallbacks.current.add(callback)
    return () => {
      leaderboardCallbacks.current.delete(callback)
    }
  }, [])

  const onUserStatsUpdate = useCallback((callback: (data: UserStatsUpdatePayload) => void) => {
    userStatsCallbacks.current.add(callback)
    return () => {
      userStatsCallbacks.current.delete(callback)
    }
  }, [])

  const onAdminUsersUpdate = useCallback((callback: (data: AdminUsersUpdatePayload) => void) => {
    adminUsersCallbacks.current.add(callback)
    return () => {
      adminUsersCallbacks.current.delete(callback)
    }
  }, [])

  return {
    status,
    joinContest,
    leaveContest,
    trackSubmission,
    onVerdictUpdate,
    onLeaderboardUpdate,
    onUserStatsUpdate,
    onAdminUsersUpdate,
  }
}
