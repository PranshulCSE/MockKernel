import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router'
import {
  ShieldAlert,
  ArrowLeft,
  Download,
  AlertTriangle,
  CheckCircle2,
  Users,
  Award,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react'
import { assessmentsApi, type AssessmentReportData } from '../../api/assessments'
import { Button, GlassCard, Badge } from '../../components/ui'

export default function AdminAssessmentReportPage() {
  const { id } = useParams<{ id: string }>()

  const [loading, setLoading] = useState<boolean>(true)
  const [reportData, setReportData] = useState<AssessmentReportData | null>(null)
  const [errorMessage, setErrorMessage] = useState<string>('')
  const [downloadingCsv, setDownloadingCsv] = useState<boolean>(false)

  // Expandable candidate violation breakdown rows
  const [expandedCandidates, setExpandedCandidates] = useState<Record<string, boolean>>({})

  const fetchReport = async () => {
    if (!id) return
    try {
      setLoading(true)
      setErrorMessage('')
      const data = await assessmentsApi.getReport(id)
      setReportData(data)
    } catch (err: any) {
      setErrorMessage(
        err?.response?.data?.error?.message || err?.message || 'Failed to load report.'
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void fetchReport()
  }, [id])

  const toggleExpand = (candidateId: string) => {
    setExpandedCandidates((prev) => ({
      ...prev,
      [candidateId]: !prev[candidateId],
    }))
  }

  const handleDownloadCsv = async () => {
    if (!reportData || !id) return
    try {
      setDownloadingCsv(true)
      await assessmentsApi.downloadCsvReport(id, reportData.assessment.code)
    } catch (err: any) {
      alert(err?.message || 'Download failed.')
    } finally {
      setDownloadingCsv(false)
    }
  }

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-muted">
          <RefreshCw className="size-8 animate-spin text-cyan" />
          <p className="font-mono text-sm">Generating proctoring audit report...</p>
        </div>
      </div>
    )
  }

  if (errorMessage || !reportData) {
    return (
      <div className="mx-auto max-w-xl p-8">
        <GlassCard className="p-8 text-center space-y-4">
          <AlertTriangle className="size-10 text-bad mx-auto" />
          <h2 className="text-xl font-bold font-display text-ink">Unable to Load Report</h2>
          <p className="text-sm text-muted">{errorMessage || 'Report not found'}</p>
          <Link to="/admin/assessments">
            <Button variant="primary">Back to Assessments</Button>
          </Link>
        </GlassCard>
      </div>
    )
  }

  const { assessment, sessions } = reportData

  // Summary Metrics
  const totalCandidates = sessions.length
  const completedCandidates = sessions.filter(
    (s) => s.status === 'SUBMITTED'
  ).length
  const disqualifiedCandidates = sessions.filter(
    (s) =>
      s.status === 'AUTO_SUBMITTED_VIOLATION' ||
      s.status === 'AUTO_SUBMITTED_PAGE_RELOAD'
  ).length
  const avgScore =
    totalCandidates > 0
      ? Math.round(
          sessions.reduce((acc, s) => acc + (s.score || 0), 0) / totalCandidates
        )
      : 0

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-6">
        <div className="space-y-1">
          <Link
            to="/admin/assessments"
            className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-ink transition-colors mb-2"
          >
            <ArrowLeft className="size-3.5" />
            <span>Back to Assessments</span>
          </Link>

          <div className="flex items-center gap-2.5">
            <ShieldAlert className="size-6 text-cyan" />
            <h1 className="font-display text-2xl sm:text-3xl font-bold text-ink">
              {assessment.title}
            </h1>
            <span className="font-mono text-xs font-semibold uppercase text-cyan px-2 py-0.5 rounded bg-cyan/10 border border-cyan/20">
              {assessment.code}
            </span>
          </div>
          <p className="text-xs text-muted">
            Live proctoring logs, anti-cheat violation tallies, and candidate test pass rates.
          </p>
        </div>

        {/* Export Button */}
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void fetchReport()}
            className="text-xs text-muted hover:text-ink"
          >
            <RefreshCw className="size-3.5 mr-1.5" />
            Refresh
          </Button>
          <Button
            variant="primary"
            size="sm"
            disabled={downloadingCsv}
            onClick={() => void handleDownloadCsv()}
            className="text-xs font-semibold bg-cyan hover:bg-cyan/80 text-black border-none shadow-glow-cyan"
          >
            <Download className="size-3.5 mr-1.5" />
            {downloadingCsv ? 'Downloading...' : 'Export to CSV / Excel'}
          </Button>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <GlassCard className="p-4">
          <div className="flex items-center gap-2 text-xs text-muted mb-1">
            <Users className="size-4 text-cyan" />
            <span>Total Candidates</span>
          </div>
          <div className="text-2xl font-bold font-mono text-ink">{totalCandidates}</div>
        </GlassCard>

        <GlassCard className="p-4">
          <div className="flex items-center gap-2 text-xs text-muted mb-1">
            <CheckCircle2 className="size-4 text-good" />
            <span>Completed Sessions</span>
          </div>
          <div className="text-2xl font-bold font-mono text-good">{completedCandidates}</div>
        </GlassCard>

        <GlassCard className="p-4">
          <div className="flex items-center gap-2 text-xs text-muted mb-1">
            <Award className="size-4 text-cyan" />
            <span>Average Score</span>
          </div>
          <div className="text-2xl font-bold font-mono text-cyan">{avgScore}%</div>
        </GlassCard>

        <GlassCard className="p-4">
          <div className="flex items-center gap-2 text-xs text-muted mb-1">
            <AlertTriangle className="size-4 text-bad" />
            <span>Disqualified / Flagged</span>
          </div>
          <div className="text-2xl font-bold font-mono text-bad">
            {disqualifiedCandidates}
          </div>
        </GlassCard>
      </div>

      {/* Candidates Table */}
      <GlassCard className="p-0 overflow-hidden">
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
          <h2 className="text-base font-bold font-display text-ink">
            Candidate Submissions & Proctoring Audits ({sessions.length})
          </h2>
          <span className="text-xs text-muted">Click row to expand incident logs</span>
        </div>

        {sessions.length === 0 ? (
          <div className="p-8 text-center text-xs text-muted">
            No candidates have attempted this assessment yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-white/10 bg-white/5 uppercase tracking-wider text-muted font-mono">
                <tr>
                  <th className="p-3.5 pl-6">Candidate</th>
                  <th className="p-3.5">Status</th>
                  <th className="p-3.5">Score</th>
                  <th className="p-3.5">Test Cases</th>
                  <th className="p-3.5">Strikes</th>
                  <th className="p-3.5">Integrity Badge</th>
                  <th className="p-3.5 pr-6 text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {sessions.map((session) => {
                  const isExpanded = Boolean(expandedCandidates[session.id])
                  const isClean = session.violationsCount === 0 && session.strikes === 0
                  const isDisqualified =
                    session.status === 'AUTO_SUBMITTED_VIOLATION' ||
                    session.status === 'AUTO_SUBMITTED_PAGE_RELOAD' ||
                    session.strikes >= 3

                  return (
                    <tr
                      key={session.id}
                      className="group hover:bg-white/5 transition-colors cursor-pointer"
                      onClick={() => toggleExpand(session.id)}
                    >
                      <td colSpan={7} className="p-0">
                        {/* Main row cells */}
                        <div className="flex items-center justify-between p-3.5 pl-6 pr-6">
                          <div className="w-1/4">
                            <div className="font-semibold text-ink">{session.candidateName}</div>
                            <div className="text-[11px] text-muted">{session.candidateEmail}</div>
                          </div>

                          <div className="w-1/6">
                            <Badge
                              tone={
                                session.status === 'SUBMITTED'
                                  ? 'run'
                                  : session.status === 'IN_PROGRESS'
                                  ? 'flag'
                                  : 'bad'
                              }
                            >
                              {session.status}
                            </Badge>
                          </div>

                          <div className="w-1/12 font-mono font-bold text-ink">
                            {session.score}%
                          </div>

                          <div className="w-1/8 font-mono text-muted">
                            {session.testCasesPassed} / {session.totalTestCases}
                          </div>

                          <div className="w-1/12 font-mono">
                            <span
                              className={`font-bold ${
                                session.strikes >= 3
                                  ? 'text-bad'
                                  : session.strikes > 0
                                  ? 'text-flag'
                                  : 'text-good'
                              }`}
                            >
                              {session.strikes}/3
                            </span>
                          </div>

                          <div className="w-1/5">
                            {isClean ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-good">
                                <ShieldCheck className="size-3.5" /> Clean (0 Violations)
                              </span>
                            ) : isDisqualified ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-bad">
                                <ShieldAlert className="size-3.5" /> Disqualified
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-flag">
                                <AlertTriangle className="size-3.5" /> Flagged ({session.violationsCount})
                              </span>
                            )}
                          </div>

                          <div className="w-8 text-right text-muted group-hover:text-ink">
                            {isExpanded ? (
                              <ChevronDown className="size-4 ml-auto" />
                            ) : (
                              <ChevronRight className="size-4 ml-auto" />
                            )}
                          </div>
                        </div>

                        {/* Expandable Gemini Violation Logs Drawer */}
                        {isExpanded && (
                          <div
                            className="bg-black/30 border-t border-white/10 p-4 pl-8 pr-8 space-y-3"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-semibold text-ink">
                                Gemini AI Proctoring & Anti-Cheat Incident Logs ({session.violationLogs.length})
                              </span>
                              <span className="text-muted">
                                Started: {new Date(session.startedAt).toLocaleString()}
                              </span>
                            </div>

                            {session.violationLogs.length === 0 ? (
                              <div className="text-xs text-good py-2">
                                ✓ No proctoring violations recorded for this candidate. Candidate remained focused and compliant throughout.
                              </div>
                            ) : (
                              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                                {session.violationLogs.map((v, vIdx) => (
                                  <div
                                    key={vIdx}
                                    className="flex items-center justify-between p-2 rounded-lg bg-white/5 border border-white/5 text-xs"
                                  >
                                    <div className="flex items-center gap-2">
                                      <span className="font-mono text-muted text-[10px]">
                                        {new Date(v.timestamp).toLocaleTimeString()}
                                      </span>
                                      <span className="font-semibold text-bad uppercase text-[10px] px-1.5 py-0.5 rounded bg-bad/15 border border-bad/30">
                                        {v.type}
                                      </span>
                                      <span className="text-ink">{v.reason}</span>
                                    </div>
                                    <span className="font-mono text-[11px] text-muted">
                                      {v.confidence}% confidence
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </GlassCard>
    </div>
  )
}
