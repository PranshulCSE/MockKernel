import { client } from './client'
import type { Verdict } from '../types/verdict'

export interface SubmissionItem {
  id: string
  submissionId?: string
  problem?: string | { id: string; title: string; slug?: string }
  contest?: string | null
  language: string
  verdict: Verdict
  runtime?: number
  memory?: number
  createdAt: string
  updatedAt: string
}

export interface SubmissionsResponse {
  data: SubmissionItem[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

export async function listUserSubmissions(params?: {
  page?: number
  limit?: number
  problemId?: string
  verdict?: string
}): Promise<SubmissionsResponse> {
  return client.get<SubmissionsResponse>('/api/submissions', { params })
}
