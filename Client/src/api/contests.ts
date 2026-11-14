import { useAuthStore } from '../store/authStore'
import type { Pagination } from './problems'

const API_BASE_URL =
  (import.meta as { env?: { VITE_API_URL?: string } }).env?.VITE_API_URL ||
  'http://localhost:3000'

export type ContestStatus = 'draft' | 'live' | 'ended'

export interface ContestSummary {
  id: string
  title: string
  description?: string
  status: ContestStatus
  startTime: string
  endTime: string
  problemCount: number
  participantCount: number
  hasJoined?: boolean
}

export interface ContestProblemRef {
  problem: {
    id: string
    title: string
    difficulty: 'Easy' | 'Medium' | 'Hard'
  }
  points: number
  order: number
}

export interface ContestDetail extends ContestSummary {
  problems: ContestProblemRef[]
  participation?: {
    joinedAt: string
    isDisqualified: boolean
  } | null
}

function getAuthHeaders(): Record<string, string> {
  const token = useAuthStore.getState().accessToken
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

export async function getContests(params?: {
  page?: number
  limit?: number
  status?: 'live' | 'ended'
}): Promise<{ data: ContestSummary[]; pagination: Pagination }> {
  const query = new URLSearchParams()
  if (params?.page) query.set('page', String(params.page))
  if (params?.limit) query.set('limit', String(params.limit))
  if (params?.status) query.set('status', params.status)

  const res = await fetch(`${API_BASE_URL}/api/contests?${query.toString()}`, {
    headers: getAuthHeaders(),
  })

  if (!res.ok) {
    throw new Error(`Failed to fetch contests: ${res.statusText}`)
  }

  return res.json()
}

export async function getContestById(id: string): Promise<ContestDetail> {
  const res = await fetch(`${API_BASE_URL}/api/contests/${id}`, {
    headers: getAuthHeaders(),
  })

  if (!res.ok) {
    throw new Error(`Failed to fetch contest: ${res.statusText}`)
  }

  const json = await res.json()
  return json.data
}

export async function joinContest(id: string) {
  if (id.startsWith('mock-')) {
    try {
      const stored = JSON.parse(localStorage.getItem('mk_joined_contests') || '[]')
      if (!stored.includes(id)) {
        stored.push(id)
        localStorage.setItem('mk_joined_contests', JSON.stringify(stored))
      }
    } catch {}
    return { contestId: id, joinedAt: new Date().toISOString() }
  }

  try {
    const res = await fetch(`${API_BASE_URL}/api/contests/${id}/join`, {
      method: 'POST',
      headers: getAuthHeaders(),
    })

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data?.error?.message || 'Failed to join contest')
    }

    const json = await res.json()
    return json.data
  } catch (err: any) {
    // If backend is offline or connection refused, allow preview join
    if (err?.message?.includes('Failed to fetch') || err?.name === 'TypeError') {
      try {
        const stored = JSON.parse(localStorage.getItem('mk_joined_contests') || '[]')
        if (!stored.includes(id)) {
          stored.push(id)
          localStorage.setItem('mk_joined_contests', JSON.stringify(stored))
        }
      } catch {}
      return { contestId: id, joinedAt: new Date().toISOString() }
    }
    throw err
  }
}

export async function leaveContest(id: string) {
  if (id.startsWith('mock-')) {
    try {
      const stored = JSON.parse(localStorage.getItem('mk_joined_contests') || '[]')
      const next = stored.filter((c: string) => c !== id)
      localStorage.setItem('mk_joined_contests', JSON.stringify(next))
    } catch {}
    return { contestId: id, left: true }
  }

  try {
    const res = await fetch(`${API_BASE_URL}/api/contests/${id}/leave`, {
      method: 'POST',
      headers: getAuthHeaders(),
    })

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data?.error?.message || 'Failed to leave contest')
    }

    const json = await res.json()
    return json.data
  } catch (err: any) {
    if (err?.message?.includes('Failed to fetch') || err?.name === 'TypeError') {
      try {
        const stored = JSON.parse(localStorage.getItem('mk_joined_contests') || '[]')
        const next = stored.filter((c: string) => c !== id)
        localStorage.setItem('mk_joined_contests', JSON.stringify(next))
      } catch {}
      return { contestId: id, left: true }
    }
    throw err
  }
}

export async function getContestLeaderboard(id: string, params?: { page?: number; limit?: number }) {
  const query = new URLSearchParams()
  if (params?.page) query.set('page', String(params.page))
  if (params?.limit) query.set('limit', String(params.limit))

  const res = await fetch(`${API_BASE_URL}/api/contests/${id}/leaderboard?${query.toString()}`, {
    headers: getAuthHeaders(),
  })

  if (!res.ok) {
    throw new Error(`Failed to fetch leaderboard: ${res.statusText}`)
  }

  const json = await res.json()
  return json.data
}
