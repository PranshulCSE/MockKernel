import type { Verdict } from './verdict'

export type SocketStatus = 'connected' | 'reconnecting' | 'polling' | 'disconnected'

export interface TestCaseResult {
  testCaseId?: string | number
  status: Verdict
  runtime?: number
  memory?: number
  stdout?: string
  stderr?: string
  expectedOutput?: string
}

export interface VerdictUpdatePayload {
  submissionId: string
  verdict: Verdict
  runtime?: number
  memory?: number
  compileOutput?: string
  testCaseResults?: TestCaseResult[]
}

export interface LeaderboardEntry {
  rank: number
  userId: string
  name: string
  score: number
  problemsSolved?: number
  lastSubmissionTime?: string
}

export interface LeaderboardUpdatePayload {
  contestId: string
  entries: LeaderboardEntry[]
  pagination?: {
    page: number
    limit: number
    total: number
  }
}
