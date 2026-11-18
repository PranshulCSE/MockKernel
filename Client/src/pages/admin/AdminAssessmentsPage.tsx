import { useState, useEffect } from 'react'
import { Link } from 'react-router'
import {
  ShieldAlert,
  Plus,
  Copy,
  Check,
  Users,
  Clock,
  FileSpreadsheet,
  RefreshCw,
} from 'lucide-react'
import { assessmentsApi, type AdminAssessmentItem } from '../../api/assessments'
import { Button, GlassCard, Badge } from '../../components/ui'

export default function AdminAssessmentsPage() {
  const [assessments, setAssessments] = useState<AdminAssessmentItem[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [copiedCode, setCopiedCode] = useState<string | null>(null)

  const fetchAssessments = async () => {
    try {
      setLoading(true)
      const data = await assessmentsApi.listAdmin()
      setAssessments(data)
    } catch (err) {
      console.warn('Failed to load assessments:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void fetchAssessments()
  }, [])

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code)
    setCopiedCode(code)
    setTimeout(() => setCopiedCode(null), 2000)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-6">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <ShieldAlert className="size-6 text-cyan" />
            <h1 className="font-display text-2xl sm:text-3xl font-bold text-ink">
              Assessments & Proctoring
            </h1>
          </div>
          <p className="text-xs text-muted">
            Manage timed proctored examinations, generate access codes, monitor violations, and export reports.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void fetchAssessments()}
            className="text-xs text-muted hover:text-ink"
          >
            <RefreshCw className="size-3.5 mr-1.5" />
            Refresh
          </Button>
          <Link to="/admin/assessments/new">
            <Button
              variant="primary"
              size="sm"
              className="text-xs font-semibold shadow-glow"
            >
              <Plus className="size-4 mr-1.5" />
              Create Assessment
            </Button>
          </Link>
        </div>
      </div>

      {/* Assessments List / Table */}
      <GlassCard className="p-0 overflow-hidden">
        {loading ? (
          <div className="flex h-64 items-center justify-center">
            <div className="flex flex-col items-center gap-2 text-muted">
              <RefreshCw className="size-6 animate-spin text-cyan" />
              <span className="text-xs font-mono">Loading assessments...</span>
            </div>
          </div>
        ) : assessments.length === 0 ? (
          <div className="p-12 text-center space-y-4">
            <ShieldAlert className="size-10 text-muted mx-auto opacity-40" />
            <h3 className="text-base font-bold text-ink">No Assessments Created Yet</h3>
            <p className="text-xs text-muted max-w-sm mx-auto">
              Create your first AI-proctored assessment with custom time windows and access codes.
            </p>
            <Link to="/admin/assessments/new">
              <Button variant="primary" size="sm">
                <Plus className="size-4 mr-1.5" />
                Create New Assessment
              </Button>
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-white/10 bg-white/5 uppercase tracking-wider text-muted font-mono">
                <tr>
                  <th className="p-3.5 pl-6">Title & Access Code</th>
                  <th className="p-3.5">Status</th>
                  <th className="p-3.5">Duration</th>
                  <th className="p-3.5">Time Window</th>
                  <th className="p-3.5">Candidates</th>
                  <th className="p-3.5 pr-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {assessments.map((item) => (
                  <tr key={item.id} className="hover:bg-white/5 transition-colors">
                    <td className="p-3.5 pl-6">
                      <div className="font-semibold text-ink text-sm">{item.title}</div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="font-mono text-xs text-cyan font-bold bg-cyan/10 border border-cyan/20 px-2 py-0.5 rounded">
                          {item.code}
                        </span>
                        <button
                          type="button"
                          onClick={() => copyCode(item.code)}
                          className="text-muted hover:text-ink transition-colors"
                          title="Copy Code"
                        >
                          {copiedCode === item.code ? (
                            <Check className="size-3 text-good" />
                          ) : (
                            <Copy className="size-3" />
                          )}
                        </button>
                      </div>
                    </td>

                    <td className="p-3.5">
                      <Badge
                        tone={
                          item.status === 'ACTIVE'
                            ? 'run'
                            : item.status === 'COMPLETED'
                            ? 'ok'
                            : 'flag'
                        }
                      >
                        {item.status}
                      </Badge>
                    </td>

                    <td className="p-3.5 font-mono text-muted">
                      <div className="flex items-center gap-1.5">
                        <Clock className="size-3.5 text-cyan" />
                        <span>{item.durationMinutes}m</span>
                      </div>
                    </td>

                    <td className="p-3.5 text-muted">
                      <div>{new Date(item.startTime).toLocaleDateString()}</div>
                      <div className="text-[10px] opacity-75">
                        to {new Date(item.endTime).toLocaleDateString()}
                      </div>
                    </td>

                    <td className="p-3.5">
                      <div className="flex items-center gap-1.5 font-mono text-ink">
                        <Users className="size-3.5 text-cyan" />
                        <span>{item.candidateCount}</span>
                      </div>
                    </td>

                    <td className="p-3.5 pr-6 text-right space-x-2">
                      <Link to={`/admin/assessments/${item.id}/report`}>
                        <Button variant="ghost" size="sm" className="text-xs">
                          <FileSpreadsheet className="size-3.5 mr-1.5 text-cyan" />
                          View Report
                        </Button>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </GlassCard>
    </div>
  )
}
