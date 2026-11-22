import { useState, useEffect, useCallback } from 'react'
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
  Pencil,
  Trash2,
} from 'lucide-react'
import { assessmentsApi, type AdminAssessmentItem } from '../../api/assessments'
import { Button, GlassCard, Badge, Modal, Input, useToast } from '../../components/ui'

export default function AdminAssessmentsPage() {
  const [assessments, setAssessments] = useState<AdminAssessmentItem[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [copiedCode, setCopiedCode] = useState<string | null>(null)
  const [editing, setEditing] = useState<AdminAssessmentItem | null>(null)
  const [deleting, setDeleting] = useState<AdminAssessmentItem | null>(null)
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({ title: '', description: '', code: '', durationMinutes: '60', startTime: '', endTime: '' })
  const toast = useToast()

  const editAssessment = (item: AdminAssessmentItem) => {
    const localDate = (value: string) => {
      const date = new Date(value)
      return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
    }
    setEditing(item)
    setForm({ title: item.title, description: item.description || '', code: item.code, durationMinutes: String(item.durationMinutes), startTime: localDate(item.startTime), endTime: localDate(item.endTime) })
  }

  const saveAssessment = async () => {
    if (!editing) return
    setBusy(true)
    try {
      await assessmentsApi.update(editing.id, { ...form, durationMinutes: Number(form.durationMinutes), startTime: new Date(form.startTime).toISOString(), endTime: new Date(form.endTime).toISOString() })
      toast.success('Assessment updated.')
      setEditing(null)
      await fetchAssessments()
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Could not update assessment.') }
    finally { setBusy(false) }
  }

  const removeAssessment = async () => {
    if (!deleting) return
    setBusy(true)
    try {
      await assessmentsApi.remove(deleting.id)
      toast.success('Assessment and its candidate sessions were deleted.')
      setDeleting(null)
      await fetchAssessments()
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Could not delete assessment.') }
    finally { setBusy(false) }
  }

  const fetchAssessments = useCallback(async () => {
    try {
      setLoading(true)
      const data = await assessmentsApi.listAdmin()
      setAssessments(data)
    } catch (err) {
      console.warn('Failed to load assessments:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchAssessments()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [fetchAssessments])

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
                      <Button variant="ghost" size="sm" className="text-xs" onClick={() => editAssessment(item)}>
                        <Pencil className="size-3.5 mr-1.5" /> Edit
                      </Button>
                      <Link to={`/admin/assessments/${item.id}/report`}>
                        <Button variant="ghost" size="sm" className="text-xs">
                          <FileSpreadsheet className="size-3.5 mr-1.5 text-cyan" />
                          View Report
                        </Button>
                      </Link>
                      <Button variant="ghost" size="sm" className="text-xs text-bad" onClick={() => setDeleting(item)}>
                        <Trash2 className="size-3.5 mr-1.5" /> Delete
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </GlassCard>

      <Modal isOpen={Boolean(editing)} onClose={() => setEditing(null)} title="Edit assessment" description="Update the assessment details and availability window." footer={<>
        <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
        <Button variant="primary" loading={busy} onClick={() => void saveAssessment()}>Save changes</Button>
      </>}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <Input label="Access code" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} />
          <Input label="Duration (minutes)" type="number" min={5} max={1440} value={form.durationMinutes} onChange={(e) => setForm({ ...form, durationMinutes: e.target.value })} />
          <Input label="Starts" type="datetime-local" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} />
          <Input label="Ends" type="datetime-local" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} />
          <label className="sm:col-span-2 flex flex-col gap-1.5 text-sm font-medium text-ink">Description<textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="rounded-ctl border border-white/10 bg-white/5 p-3 text-sm" /></label>
        </div>
      </Modal>

      <Modal isOpen={Boolean(deleting)} onClose={() => setDeleting(null)} title="Delete assessment?" description="This permanently removes the assessment and all candidate sessions, results, and proctoring logs." footer={<>
        <Button variant="ghost" onClick={() => setDeleting(null)}>Cancel</Button>
        <Button variant="secondary" loading={busy} className="text-bad" onClick={() => void removeAssessment()}>Delete assessment</Button>
      </>}>
        <p className="text-sm text-muted">Delete <strong className="text-ink">{deleting?.title}</strong> and its stored results?</p>
      </Modal>
    </div>
  )
}
