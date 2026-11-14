import { client } from './client'
import { useAuthStore } from '../store/authStore'

const BASE_URL =
  (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/+$/, '') || 'http://localhost:3000'

export interface AssessmentProblem {
  _id: string
  title: string
  statement: string
  difficulty: 'Easy' | 'Medium' | 'Hard'
  constraints: string
  starterCode?: Record<string, string>
  supportedLanguages: string[]
}

export interface AssessmentSummary {
  id: string
  title: string
  description?: string
  code: string
  durationMinutes: number
  startTime: string
  endTime: string
  windowState: 'UPCOMING' | 'OPEN' | 'EXPIRED'
  problemCount: number
  problems: AssessmentProblem[]
  existingSession: {
    id: string
    status: string
    strikes: number
    startedAt: string
    submittedAt?: string
    codeSubmissions?: Record<string, any>
  } | null
}

export interface AssessmentSessionState {
  id: string
  assessmentId: string
  status:
    | 'IN_PROGRESS'
    | 'SUBMITTED'
    | 'AUTO_SUBMITTED_VIOLATION'
    | 'AUTO_SUBMITTED_PAGE_RELOAD'
    | 'TIMED_OUT'
  strikes: number
  startedAt: string
  submittedAt?: string
  score?: number
  testCasesPassed?: number
  totalTestCases?: number
  codeSubmissions?: Record<string, { code: string; language: string; submittedAt?: string }>
  violationLogs?: Array<{
    timestamp: string
    type: string
    reason: string
    confidence: number
  }>
}

export interface ProctorAnalysisResult {
  flagged: boolean
  type: string
  reason: string
  confidence: number
  suspicionScore: number
  gazeDirection: string
  details: string
  currentStrikes?: number
  sessionStatus?: string
}

export interface AdminAssessmentItem {
  id: string
  _id: string
  title: string
  code: string
  description?: string
  durationMinutes: number
  startTime: string
  endTime: string
  status: 'DRAFT' | 'ACTIVE' | 'COMPLETED'
  candidateCount: number
  createdAt: string
}

export interface CandidateReportItem {
  id: string
  candidateName: string
  candidateEmail: string
  status: string
  score: number
  testCasesPassed: number
  totalTestCases: number
  strikes: number
  violationsCount: number
  violationLogs: Array<{
    timestamp: string
    type: string
    reason: string
    confidence: number
  }>
  startedAt: string
  submittedAt?: string
}

export interface AssessmentReportData {
  assessment: {
    id: string
    title: string
    code: string
    startTime: string
    endTime: string
    durationMinutes: number
    problems: Array<{ _id: string; title: string; difficulty: string }>
  }
  sessions: CandidateReportItem[]
}

export interface CreateAssessmentPayload {
  title: string
  description?: string
  code?: string
  durationMinutes: number
  startTime: string
  endTime: string
  problemIds?: string[]
  allowCustomProblems?: boolean
  customProblems?: Array<{
    title: string
    statement: string
    difficulty: 'Easy' | 'Medium' | 'Hard'
    constraints: string
    starterCode?: Record<string, string>
  }>
}

export const assessmentsApi = {
  // Candidate: Check code and fetch assessment instructions
  join: async (code: string): Promise<AssessmentSummary> => {
    const res = await client.get<{ data: AssessmentSummary }>(`/api/assessments/join/${code.toUpperCase()}`)
    return res.data
  },

  // Candidate: Start session and begin timed countdown
  start: async (
    assessmentId: string
  ): Promise<{
    session: AssessmentSessionState
    deadline: string
    durationMinutes: number
    problems: AssessmentProblem[]
  }> => {
    const res = await client.post<{
      data: {
        session: AssessmentSessionState
        deadline: string
        durationMinutes: number
        problems: AssessmentProblem[]
      }
    }>(`/api/assessments/${assessmentId}/start`)
    return res.data
  },

  // Candidate: Record a strike for blur/fullscreen exit
  strike: async (
    assessmentId: string,
    payload: { type: string; reason: string }
  ): Promise<{
    strikes: number
    status: string
    autoSubmitted: boolean
    violationLogs: Array<{ timestamp: string; type: string; reason: string; confidence: number }>
  }> => {
    const res = await client.post<{
      data: {
        strikes: number
        status: string
        autoSubmitted: boolean
        violationLogs: Array<{ timestamp: string; type: string; reason: string; confidence: number }>
      }
    }>(`/api/assessments/${assessmentId}/strike`, payload)
    return res.data
  },

  // Candidate: Manual submission
  submit: async (
    assessmentId: string,
    codeSubmissions: Record<string, { code: string; language: string; testCasesPassed?: number; totalTestCases?: number }>
  ): Promise<{
    id: string
    status: string
    score: number
    testCasesPassed: number
    totalTestCases: number
    submittedAt: string
  }> => {
    const res = await client.post<{
      data: {
        id: string
        status: string
        score: number
        testCasesPassed: number
        totalTestCases: number
        submittedAt: string
      }
    }>(`/api/assessments/${assessmentId}/submit`, { codeSubmissions })
    return res.data
  },

  // Candidate: Send webcam frame for AI proctoring
  sendProctorFrame: async (
    assessmentId: string,
    frameBase64: string
  ): Promise<ProctorAnalysisResult> => {
    const res = await client.post<{ data: ProctorAnalysisResult }>(
      `/api/assessments/${assessmentId}/proctor-frame`,
      { frame: frameBase64 }
    )
    return res.data
  },

  // Beacon fallback auto-submit for page close or refresh
  sendBeaconAutoSubmit: (
    assessmentId: string,
    data: {
      userId?: string
      sessionId?: string
      reason: string
      status?: string
      codeSubmissions?: Record<string, any>
    }
  ): boolean => {
    const url = `${BASE_URL}/api/assessments/${assessmentId}/auto-submit`
    const blob = new Blob([JSON.stringify(data)], { type: 'text/plain' })
    if (navigator.sendBeacon) {
      return navigator.sendBeacon(url, blob)
    }
    // Fallback synchronous fetch
    void fetch(url, {
      method: 'POST',
      body: JSON.stringify(data),
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
    }).catch(() => {})
    return true
  },

  // Admin: List assessments
  listAdmin: async (): Promise<AdminAssessmentItem[]> => {
    const res = await client.get<{ data: AdminAssessmentItem[] }>('/api/admin/assessments')
    return res.data
  },

  // Admin: Create assessment
  create: async (payload: CreateAssessmentPayload): Promise<AdminAssessmentItem> => {
    const res = await client.post<{ data: AdminAssessmentItem }>('/api/admin/assessments', payload)
    return res.data
  },

  // Admin: View report
  getReport: async (assessmentId: string): Promise<AssessmentReportData> => {
    const res = await client.get<{ data: AssessmentReportData }>(
      `/api/admin/assessments/${assessmentId}/report`
    )
    return res.data
  },

  // Admin: Download CSV
  downloadCsvReport: async (assessmentId: string, code: string): Promise<void> => {
    const token = useAuthStore.getState().accessToken
    const res = await fetch(`${BASE_URL}/api/admin/assessments/${assessmentId}/export`, {
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    })
    if (!res.ok) {
      throw new Error('Failed to download assessment report CSV')
    }
    const blob = await res.blob()
    const downloadUrl = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = downloadUrl
    a.download = `assessment-${code}-report.csv`
    document.body.appendChild(a)
    a.click()
    a.remove()
    window.URL.revokeObjectURL(downloadUrl)
  },
}
