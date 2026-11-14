import { client } from './client'

export interface InterviewQuestion {
  question: string
  topic?: string
  askedAt?: string
  answer?: string
  answeredAt?: string
  score?: number
  feedback?: string
}

export interface InterviewEvaluation {
  score: number
  feedback: string
}

export interface InterviewSummary {
  overallScore: number
  feedback: string
  strengths?: string[]
  weaknesses?: string[]
}

export interface InterviewSession {
  id: string
  sessionId?: string
  user?: string
  difficulty: 'Easy' | 'Medium' | 'Hard'
  topics: string[]
  questionCount: number
  status: 'in_progress' | 'completed' | 'abandoned'
  questions: InterviewQuestion[]
  overallScore?: number
  feedback?: string
  startedAt: string
  completedAt?: string
}

export interface StartInterviewResponse {
  id: string
  sessionId: string
  status: string
  difficulty: 'Easy' | 'Medium' | 'Hard'
  topics: string[]
  questionCount: number
  questionNumber: number
  question: { question: string; topic?: string }
  startedAt: string
}

export interface SubmitAnswerResponse {
  sessionId: string
  status: string
  evaluation: InterviewEvaluation
  isComplete: boolean
  questionNumber?: number
  questionCount?: number
  nextQuestion?: { question: string; topic?: string }
  summary?: InterviewSummary
  completedAt?: string
}

export interface ListInterviewsResponse {
  data: InterviewSession[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

export async function startInterview(payload: {
  topics: string[]
  difficulty: string
  questionCount: number
}): Promise<StartInterviewResponse> {
  const res = await client.post<{ data: StartInterviewResponse }>('/api/interviews', payload)
  return res.data
}

export async function submitInterviewAnswer(
  sessionId: string,
  answer: string,
): Promise<SubmitAnswerResponse> {
  const res = await client.post<{ data: SubmitAnswerResponse }>(
    `/api/interviews/${sessionId}/answer`,
    { answer },
  )
  return res.data
}

export async function completeInterview(sessionId: string): Promise<InterviewSession> {
  const res = await client.post<{ data: InterviewSession }>(
    `/api/interviews/${sessionId}/complete`,
  )
  return res.data
}

export async function abandonInterview(sessionId: string): Promise<{ id: string; status: string }> {
  const res = await client.patch<{ data: { id: string; status: string } }>(
    `/api/interviews/${sessionId}/abandon`,
  )
  return res.data
}

export async function getInterview(sessionId: string): Promise<InterviewSession> {
  const res = await client.get<{ data: InterviewSession }>(`/api/interviews/${sessionId}`)
  return res.data
}

export async function listInterviews(params?: {
  page?: number
  limit?: number
  status?: string
  difficulty?: string
}): Promise<ListInterviewsResponse> {
  return client.get<ListInterviewsResponse>('/api/interviews', { params })
}
