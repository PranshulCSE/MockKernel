import { client } from './client'
import type { UserRole } from '../types/auth'

export interface AdminStats {
  totalProblems: number
  publishedProblems: number
  liveContests: number
  totalSubmissions: number
  totalUsers: number
}

export interface AdminUserItem {
  id: string
  name: string
  email: string
  role: UserRole
  createdAt?: string
}

export interface TestCaseItem {
  id?: string
  input: string
  expectedOutput: string
  isSample: boolean
  order: number
  explanation?: string
}

export type SupportedLanguage = 'python' | 'cpp' | 'java' | 'javascript'
export type ProblemDifficulty = 'Easy' | 'Medium' | 'Hard'

export interface AdminProblemItem {
  id: string
  title: string
  slug?: string
  statement: string
  constraints: string
  difficulty: ProblemDifficulty
  supportedLanguages: SupportedLanguage[]
  starterCode?: Partial<Record<SupportedLanguage, string>>
  isPublished: boolean
  testCases?: TestCaseItem[]
  createdAt?: string
  updatedAt?: string
}

export interface ProblemPayload {
  title: string
  statement: string
  constraints: string
  difficulty: ProblemDifficulty
  supportedLanguages: SupportedLanguage[]
  starterCode?: Partial<Record<SupportedLanguage, string>>
  isPublished: boolean
  testCases?: TestCaseItem[]
}

export interface ContestProblemEntry {
  problem: string | { id: string; title: string; difficulty: string }
  points: number
}

export interface AdminContestItem {
  id: string
  title: string
  slug?: string
  description: string
  startTime: string
  endTime: string
  status: 'draft' | 'live' | 'ended'
  problems: ContestProblemEntry[]
  participantCount?: number
  submissionCount?: number
  createdAt?: string
}

export interface ContestPayload {
  title: string
  description: string
  startTime: string
  endTime: string
  problems: { problem: string; points: number }[]
}

export interface FlaggedSubmissionItem {
  id: string
  submissionA: {
    id: string
    user: { id: string; name: string; email: string }
    code: string
  }
  submissionB: {
    id: string
    user: { id: string; name: string; email: string }
    code: string
  }
  similarity: number
  status: 'pending' | 'reviewed' | 'disqualified'
  detectedAt: string
}

export interface PaginatedResult<T> {
  data: T[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

// Stats
export async function getAdminStats(): Promise<AdminStats> {
  const res = await client.get<{ data: AdminStats }>('/api/admin/stats')
  return res.data
}

// Users (SuperAdmin)
export async function listAdminUsers(params?: {
  page?: number
  limit?: number
  role?: string
  search?: string
}): Promise<PaginatedResult<AdminUserItem>> {
  return client.get<PaginatedResult<AdminUserItem>>('/api/admin/users', { params })
}

export async function createAdminUser(data: {
  name: string
  email: string
  password: string
}): Promise<AdminUserItem> {
  const res = await client.post<{ data: AdminUserItem }>('/api/admin/users', data)
  return res.data
}

// Problems
export async function listAdminProblems(params?: {
  page?: number
  limit?: number
  search?: string
  difficulty?: string
  isPublished?: boolean
}): Promise<PaginatedResult<AdminProblemItem>> {
  return client.get<PaginatedResult<AdminProblemItem>>('/api/admin/problems', { params })
}

export async function getAdminProblem(id: string): Promise<AdminProblemItem> {
  const res = await client.get<{ data: AdminProblemItem }>(`/api/admin/problems/${id}`)
  return res.data
}

export async function createAdminProblem(data: ProblemPayload): Promise<AdminProblemItem> {
  const res = await client.post<{ data: AdminProblemItem }>('/api/admin/problems', data)
  return res.data
}

export async function updateAdminProblem(
  id: string,
  data: Partial<ProblemPayload>,
): Promise<AdminProblemItem> {
  const res = await client.patch<{ data: AdminProblemItem }>(`/api/admin/problems/${id}`, data)
  return res.data
}

export async function deleteAdminProblem(id: string): Promise<void> {
  await client.delete(`/api/admin/problems/${id}`)
}

// Contests
export async function listAdminContests(params?: {
  page?: number
  limit?: number
  status?: string
}): Promise<PaginatedResult<AdminContestItem>> {
  return client.get<PaginatedResult<AdminContestItem>>('/api/admin/contests', { params })
}

export async function getAdminContest(id: string): Promise<AdminContestItem> {
  const res = await client.get<{ data: AdminContestItem }>(`/api/admin/contests/${id}`)
  return res.data
}

export async function createAdminContest(data: ContestPayload): Promise<AdminContestItem> {
  const res = await client.post<{ data: AdminContestItem }>('/api/admin/contests', data)
  return res.data
}

export async function updateAdminContest(
  id: string,
  data: Partial<ContestPayload>,
): Promise<AdminContestItem> {
  const res = await client.patch<{ data: AdminContestItem }>(`/api/admin/contests/${id}`, data)
  return res.data
}

export async function startAdminContest(id: string): Promise<AdminContestItem> {
  const res = await client.post<{ data: AdminContestItem }>(`/api/admin/contests/${id}/start`)
  return res.data
}

export async function endAdminContest(id: string): Promise<AdminContestItem> {
  const res = await client.post<{ data: AdminContestItem }>(`/api/admin/contests/${id}/end`)
  return res.data
}

export async function rebuildAdminLeaderboard(id: string): Promise<void> {
  await client.post(`/api/admin/contests/${id}/leaderboard/rebuild`)
}

export async function getFlaggedSubmissions(contestId: string): Promise<FlaggedSubmissionItem[]> {
  const res = await client.get<{ data: FlaggedSubmissionItem[] }>(
    `/api/admin/contests/${contestId}/flagged`,
  )
  return res.data
}

export async function getAdminContestSubmissions(
  contestId: string,
  params?: { page?: number; limit?: number },
): Promise<PaginatedResult<Record<string, unknown>>> {
  return client.get<PaginatedResult<Record<string, unknown>>>(
    `/api/admin/contests/${contestId}/submissions`,
    { params },
  )
}

export async function getAdminContestParticipants(
  contestId: string,
  params?: { page?: number; limit?: number },
): Promise<PaginatedResult<Record<string, unknown>>> {
  return client.get<PaginatedResult<Record<string, unknown>>>(
    `/api/admin/contests/${contestId}/participants`,
    { params },
  )
}

export async function disqualifyParticipant(contestId: string, userId: string): Promise<void> {
  await client.patch(`/api/admin/contests/${contestId}/participants/${userId}/disqualify`)
}
