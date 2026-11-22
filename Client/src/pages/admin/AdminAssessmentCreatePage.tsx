import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router'
import {
  ShieldAlert,
  ArrowLeft,
  Plus,
  Trash2,
  Check,
  Search,
  Clock,
  Calendar,
  Lock,
  AlertCircle,
  RefreshCw,
} from 'lucide-react'
import { assessmentsApi, getApiErrorMessage } from '../../api/assessments'
import { getProblems, type ProblemSummary } from '../../api/problems'
import { Button, GlassCard, Badge } from '../../components/ui'

interface CustomProblemForm {
  title: string
  statement: string
  difficulty: 'Easy' | 'Medium' | 'Hard'
  constraints: string
}

const DEFAULT_START_ISO = new Date().toISOString().slice(0, 16)
const DEFAULT_END_ISO = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 16)

export default function AdminAssessmentCreatePage() {
  const navigate = useNavigate()

  // Form Fields
  const [title, setTitle] = useState<string>('')
  const [description, setDescription] = useState<string>('')
  const [code, setCode] = useState<string>('')
  const [durationMinutes, setDurationMinutes] = useState<number>(60)

  // Default times: start now, end in 7 days
  const [startTime, setStartTime] = useState<string>(DEFAULT_START_ISO)
  const [endTime, setEndTime] = useState<string>(DEFAULT_END_ISO)

  // Problem Selection
  const [availableProblems, setAvailableProblems] = useState<ProblemSummary[]>([])
  const [selectedProblemIds, setSelectedProblemIds] = useState<string[]>([])
  const [problemSearch, setProblemSearch] = useState<string>('')
  const [loadingProblems, setLoadingProblems] = useState<boolean>(true)

  // Custom on-the-fly problems
  const [customProblems, setCustomProblems] = useState<CustomProblemForm[]>([])

  // Submission State
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false)
  const [errorMessage, setErrorMessage] = useState<string>('')

  // Fetch published problems
  useEffect(() => {
    const fetchExisting = async () => {
      try {
        setLoadingProblems(true)
        const res = await getProblems({ limit: 50 })
        setAvailableProblems(res.data || [])
      } catch (err) {
        console.warn('Failed to load existing problems:', err)
      } finally {
        setLoadingProblems(false)
      }
    }
    void fetchExisting()
  }, [])

  // Toggle problem selection
  const toggleProblemSelection = (id: string) => {
    setSelectedProblemIds((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    )
  }

  // Add custom problem row
  const addCustomProblem = () => {
    setCustomProblems((prev) => [
      ...prev,
      {
        title: '',
        statement: '',
        difficulty: 'Medium',
        constraints: '1 <= n <= 10^5',
      },
    ])
  }

  // Remove custom problem row
  const removeCustomProblem = (index: number) => {
    setCustomProblems((prev) => prev.filter((_, idx) => idx !== index))
  }

  // Update custom problem field
  const updateCustomProblem = (index: number, field: keyof CustomProblemForm, value: string) => {
    setCustomProblems((prev) => {
      const updated = [...prev]
      const target = updated[index]
      if (target) {
        updated[index] = { ...target, [field]: value }
      }
      return updated
    })
  }

  // Handle Create Assessment
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMessage('')

    if (title.trim().length < 3) {
      setErrorMessage('Assessment title must be at least 3 characters.')
      return
    }

    if (new Date(endTime).getTime() <= new Date(startTime).getTime()) {
      setErrorMessage('End time must be strictly after start time.')
      return
    }

    if (selectedProblemIds.length === 0 && customProblems.length === 0) {
      setErrorMessage('Please select at least one problem or add a custom problem.')
      return
    }

    // Validate custom problems
    for (const [idx, cp] of customProblems.entries()) {
      if (!cp.title.trim() || cp.title.trim().length < 3) {
        setErrorMessage(`Custom Problem #${idx + 1} must have a valid title (min 3 chars).`)
        return
      }
    }

    try {
      setIsSubmitting(true)
      await assessmentsApi.create({
        title: title.trim(),
        description: description.trim(),
        code: code.trim().toUpperCase() || undefined,
        durationMinutes,
        startTime: new Date(startTime).toISOString(),
        endTime: new Date(endTime).toISOString(),
        problemIds: selectedProblemIds,
        allowCustomProblems: customProblems.length > 0,
        customProblems: customProblems.map((cp) => ({
          title: cp.title.trim(),
          statement: cp.statement.trim() || 'Custom assessment problem statement',
          difficulty: cp.difficulty,
          constraints: cp.constraints.trim(),
        })),
      })

      navigate('/admin/assessments')
    } catch (err) {
      setErrorMessage(getApiErrorMessage(err, 'Failed to create assessment. Please try again.'))
    } finally {
      setIsSubmitting(false)
    }
  }

  const filteredProblems = availableProblems.filter((p) =>
    p.title.toLowerCase().includes(problemSearch.toLowerCase())
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <Link
            to="/admin/assessments"
            className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-ink transition-colors mb-2"
          >
            <ArrowLeft className="size-3.5" />
            <span>Back to Assessments</span>
          </Link>
          <div className="flex items-center gap-2">
            <ShieldAlert className="size-6 text-cyan" />
            <h1 className="font-display text-2xl sm:text-3xl font-bold text-ink">
              Create AI-Proctored Assessment
            </h1>
          </div>
          <p className="text-xs text-muted">
            Configure candidate access codes, time window, strict anti-cheat settings, and problem sets.
          </p>
        </div>
      </div>

      {errorMessage && (
        <div className="rounded-xl border border-bad/30 bg-bad/10 p-4 flex items-start gap-3 text-sm text-bad">
          <AlertCircle className="size-5 shrink-0 mt-0.5" />
          <span>{errorMessage}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic Details Card */}
        <GlassCard className="p-6 sm:p-8 space-y-5">
          <h2 className="text-lg font-bold font-display text-ink border-b border-white/10 pb-3">
            Assessment Details & Access
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5 sm:col-span-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted">
                Assessment Title *
              </label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Frontend & Algorithms Proctored Evaluation"
                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-ink placeholder:text-muted/40 focus:border-cyan focus:outline-none"
              />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted">
                Description / Candidate Instructions
              </label>
              <textarea
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Provide test instructions, guidelines, or department notes..."
                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-ink placeholder:text-muted/40 focus:border-cyan focus:outline-none"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted flex items-center gap-1.5">
                <Lock className="size-3.5 text-cyan" />
                Access Code (Optional)
              </label>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="Auto-generated if left blank (e.g. MOCK-7X9A)"
                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-mono uppercase text-ink placeholder:text-muted/40 focus:border-cyan focus:outline-none"
              />
              <p className="text-[11px] text-muted">
                Leave blank to let the system generate a secure random code.
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted flex items-center gap-1.5">
                <Clock className="size-3.5 text-cyan" />
                Duration (Minutes) *
              </label>
              <input
                type="number"
                required
                min={5}
                max={1440}
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(Math.max(5, parseInt(e.target.value) || 60))}
                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-mono text-ink focus:border-cyan focus:outline-none"
              />
              <p className="text-[11px] text-muted">
                Countdown length allocated to each candidate once they start.
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted flex items-center gap-1.5">
                <Calendar className="size-3.5 text-cyan" />
                Window Start Time *
              </label>
              <input
                type="datetime-local"
                required
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-ink focus:border-cyan focus:outline-none"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted flex items-center gap-1.5">
                <Calendar className="size-3.5 text-cyan" />
                Window End Time *
              </label>
              <input
                type="datetime-local"
                required
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-ink focus:border-cyan focus:outline-none"
              />
            </div>
          </div>
        </GlassCard>

        {/* Existing Problems Picker Card */}
        <GlassCard className="p-6 sm:p-8 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3">
            <div>
              <h2 className="text-lg font-bold font-display text-ink">
                Select from Platform Problems
              </h2>
              <p className="text-xs text-muted">
                Selected: {selectedProblemIds.length} problem{selectedProblemIds.length === 1 ? '' : 's'}
              </p>
            </div>

            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted" />
              <input
                type="text"
                value={problemSearch}
                onChange={(e) => setProblemSearch(e.target.value)}
                placeholder="Search problem title..."
                className="w-full rounded-full border border-white/10 bg-white/5 pl-8 pr-3 py-1.5 text-xs text-ink placeholder:text-muted/40 focus:border-cyan focus:outline-none"
              />
            </div>
          </div>

          {loadingProblems ? (
            <div className="py-8 text-center text-xs text-muted animate-pulse">
              Loading problems...
            </div>
          ) : (
            <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
              {filteredProblems.map((prob) => {
                const isSelected = selectedProblemIds.includes(prob.id)
                return (
                  <div
                    key={prob.id}
                    onClick={() => toggleProblemSelection(prob.id)}
                    className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-all ${
                      isSelected
                        ? 'border-cyan/40 bg-cyan/10 text-ink shadow-glow-cyan'
                        : 'border-white/10 bg-white/5 text-muted hover:text-ink hover:bg-white/10'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`size-4 rounded border flex items-center justify-center transition-colors ${
                          isSelected ? 'border-cyan bg-cyan text-base' : 'border-white/30 bg-transparent'
                        }`}
                      >
                        {isSelected && <Check className="size-3 text-black stroke-[3]" />}
                      </div>
                      <span className="text-sm font-medium text-ink">{prob.title}</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <Badge
                        tone={
                          prob.difficulty === 'Easy'
                            ? 'run'
                            : prob.difficulty === 'Medium'
                            ? 'flag'
                            : 'bad'
                        }
                      >
                        {prob.difficulty}
                      </Badge>
                    </div>
                  </div>
                )
              })}
              {filteredProblems.length === 0 && (
                <div className="py-6 text-center text-xs text-muted">
                  No matching problems found.
                </div>
              )}
            </div>
          )}
        </GlassCard>

        {/* Custom On-The-Fly Private Problems Card */}
        <GlassCard className="p-6 sm:p-8 space-y-4">
          <div className="flex items-center justify-between border-b border-white/10 pb-3">
            <div>
              <h2 className="text-lg font-bold font-display text-ink">
                Custom Assessment Problems
              </h2>
              <p className="text-xs text-muted">
                Author private, unlisted coding challenges specific to this assessment.
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={addCustomProblem}
              className="text-xs text-cyan hover:bg-cyan/10"
            >
              <Plus className="size-3.5 mr-1" />
              Add Custom Problem
            </Button>
          </div>

          {customProblems.length === 0 ? (
            <div className="py-6 text-center text-xs text-muted border border-dashed border-white/10 rounded-xl">
              No custom problems added yet. Click &quot;Add Custom Problem&quot; if you wish to create a private challenge.
            </div>
          ) : (
            <div className="space-y-4">
              {customProblems.map((cp, idx) => (
                <div
                  key={idx}
                  className="rounded-xl border border-white/15 bg-white/5 p-4 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase text-cyan">
                      Custom Problem #{idx + 1}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeCustomProblem(idx)}
                      className="text-muted hover:text-bad p-1 rounded transition-colors"
                      title="Remove Problem"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="sm:col-span-2 space-y-1">
                      <label className="text-[11px] font-semibold text-muted">Title *</label>
                      <input
                        type="text"
                        required
                        value={cp.title}
                        onChange={(e) => updateCustomProblem(idx, 'title', e.target.value)}
                        placeholder="e.g. Reverse Binary Trees In-Memory"
                        className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-ink focus:border-cyan focus:outline-none"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold text-muted">Difficulty</label>
                      <select
                        value={cp.difficulty}
                        onChange={(e) =>
                          updateCustomProblem(
                            idx,
                            'difficulty',
                            e.target.value as 'Easy' | 'Medium' | 'Hard'
                          )
                        }
                        className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-ink focus:border-cyan focus:outline-none"
                      >
                        <option value="Easy" className="bg-base">Easy</option>
                        <option value="Medium" className="bg-base">Medium</option>
                        <option value="Hard" className="bg-base">Hard</option>
                      </select>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-muted">Statement</label>
                    <textarea
                      rows={2}
                      value={cp.statement}
                      onChange={(e) => updateCustomProblem(idx, 'statement', e.target.value)}
                      placeholder="Write problem statement, input/output formats..."
                      className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-ink focus:border-cyan focus:outline-none"
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </GlassCard>

        {/* Submit Actions */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/10">
          <Button
            type="button"
            variant="ghost"
            onClick={() => navigate('/admin/assessments')}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            disabled={isSubmitting}
            className="px-6 py-2.5 text-sm font-semibold shadow-glow"
          >
            {isSubmitting ? (
              <>
                <RefreshCw className="size-4 animate-spin mr-2" />
                Publishing Assessment...
              </>
            ) : (
              'Create & Publish Assessment'
            )}
          </Button>
        </div>
      </form>
    </div>
  )
}
