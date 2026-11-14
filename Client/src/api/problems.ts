import { useAuthStore } from '../store/authStore'
import type { Difficulty } from '../features/practice/problems'

const API_BASE_URL =
  (import.meta as { env?: { VITE_API_URL?: string } }).env?.VITE_API_URL ||
  'http://localhost:3000'

export interface ProblemSummary {
  id: string
  title: string
  difficulty: Difficulty
  supportedLanguages: string[]
  topic?: string
  acceptance?: number
  createdAt: string
}

export interface TestCaseSample {
  id: string
  input: string
  expectedOutput: string
  isSample: boolean
  order: number
  explanation?: string
}

export interface ProblemDetail extends ProblemSummary {
  statement: string
  constraints: string
  starterCode?: Record<string, string>
  sampleTestCases: TestCaseSample[]
  updatedAt?: string
}

export interface Pagination {
  page: number
  limit: number
  total: number
  totalPages: number
}

function getAuthHeaders(): Record<string, string> {
  const token = useAuthStore.getState().accessToken
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

export async function getProblems(params: {
  page?: number
  limit?: number
  search?: string
  difficulty?: string
}): Promise<{ data: ProblemSummary[]; pagination: Pagination }> {
  const query = new URLSearchParams()
  if (params.page) query.set('page', String(params.page))
  if (params.limit) query.set('limit', String(params.limit))
  if (params.search) query.set('search', params.search)
  if (params.difficulty && params.difficulty !== 'All') query.set('difficulty', params.difficulty)

  const res = await fetch(`${API_BASE_URL}/api/problems?${query.toString()}`, {
    headers: getAuthHeaders(),
  })

  if (!res.ok) {
    throw new Error(`Failed to fetch problems: ${res.statusText}`)
  }

  return res.json()
}

export async function getProblemById(id: string): Promise<ProblemDetail> {
  const res = await fetch(`${API_BASE_URL}/api/problems/${id}`, {
    headers: getAuthHeaders(),
  })

  if (!res.ok) {
    throw new Error(`Failed to fetch problem details: ${res.statusText}`)
  }

  const json = await res.json()
  return json.data
}

export interface SubmissionRequest {
  problemId: string
  language: string
  sourceCode: string
  contestId?: string
}

export async function runCode(req: SubmissionRequest) {
  const res = await fetch(`${API_BASE_URL}/api/submissions/run`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(req),
  })

  if (res.status === 429) {
    const error = new Error('Rate limit exceeded')
    ;(error as unknown as { status: number }).status = 429
    throw error
  }

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}))
    throw new Error(errData?.error?.message || `Failed to run code: ${res.statusText}`)
  }

  const json = await res.json()
  return json.data
}

export async function submitCode(req: SubmissionRequest) {
  const res = await fetch(`${API_BASE_URL}/api/submissions/submit`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(req),
  })

  if (res.status === 429) {
    const error = new Error('Rate limit exceeded')
    ;(error as unknown as { status: number }).status = 429
    throw error
  }

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}))
    throw new Error(errData?.error?.message || `Failed to submit code: ${res.statusText}`)
  }

  const json = await res.json()
  return json.data
}

export async function getSubmissions(problemId?: string) {
  const query = problemId ? `?problemId=${problemId}` : ''
  const res = await fetch(`${API_BASE_URL}/api/submissions${query}`, {
    headers: getAuthHeaders(),
  })

  if (!res.ok) return []
  const json = await res.json()
  return json.data || []
}
