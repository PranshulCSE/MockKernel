import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router'
import {
  Trophy,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  ArrowRight,
  TrendingUp,
  ListOrdered,
  MessageSquare,
} from 'lucide-react'
import { Button, GlassCard, Badge, useToast } from '../components/ui'
import { getInterview, type InterviewSession } from '../api/interviews'

export default function InterviewSummaryPage() {
  const { id: sessionId } = useParams<{ id: string }>()
  const toast = useToast()

  const [session, setSession] = useState<InterviewSession | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [openAccordions, setOpenAccordions] = useState<Record<number, boolean>>({ 0: true })

  useEffect(() => {
    if (!sessionId) return

    let isMounted = true
    const loadSession = async () => {
      try {
        const data = await getInterview(sessionId)
        if (isMounted) {
          setSession(data)
        }
      } catch {
        if (isMounted) {
          toast.error('Failed to load interview summary.')
        }
      } finally {
        if (isMounted) setIsLoading(false)
      }
    }

    void loadSession()
    return () => {
      isMounted = false
    }
  }, [sessionId, toast])

  const toggleAccordion = (idx: number) => {
    setOpenAccordions((prev) => ({
      ...prev,
      [idx]: !prev[idx],
    }))
  }

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
        <RefreshCw className="size-8 animate-spin text-cyan" />
        <p className="font-sans text-sm text-muted">Calculating interview results and insights...</p>
      </div>
    )
  }

  if (!session) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 text-center">
        <h2 className="font-display text-2xl font-bold text-ink">Interview Not Found</h2>
        <p className="font-sans text-sm text-muted">This interview session could not be retrieved.</p>
        <Link to="/interviews">
          <Button variant="primary">Return to Interviews</Button>
        </Link>
      </div>
    )
  }

  const score = session.overallScore ?? 0
  const getVerdict = (s: number) => {
    if (s >= 8.5) return { label: 'Exceptional Performance', tone: 'ok' as const }
    if (s >= 7.0) return { label: 'Strong Competency', tone: 'ok' as const }
    if (s >= 5.0) return { label: 'Solid Fundamentals', tone: 'warn' as const }
    return { label: 'Needs Improvement', tone: 'bad' as const }
  }

  const verdict = getVerdict(score)
  const answeredQuestions = session.questions.filter((q) => Boolean(q.answer))

  return (
    <div className="flex flex-col gap-10 max-w-4xl mx-auto pb-20">
      {/* Top Banner */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-cyan">
          <Trophy className="size-4" />
          <span>Evaluation Scorecard</span>
        </div>
        <h1 className="font-display text-3xl sm:text-4xl font-bold text-ink">
          Interview Assessment Results
        </h1>
        <p className="font-sans text-sm text-muted">
          Session completed on {new Date(session.completedAt || session.startedAt).toLocaleDateString()} &bull;{' '}
          {session.topics.join(', ')} ({session.difficulty})
        </p>
      </div>

      {/* Hero Score Gauge Card */}
      <GlassCard strong className="p-8 sm:p-10 relative overflow-hidden">
        <div className="grid gap-8 sm:grid-cols-[1fr_2fr] items-center">
          {/* Circular Score Gauge */}
          <div className="flex flex-col items-center justify-center">
            <div className="relative grid size-40 place-items-center rounded-full border-4 border-cyan/30 bg-base/80 shadow-[0_0_50px_rgba(6,182,212,.25)]">
              <span className="font-display text-4xl sm:text-5xl font-extrabold text-ink tracking-tight">
                {score.toFixed(1)}
              </span>
              <span className="font-mono text-xs uppercase tracking-widest text-muted mt-1">
                Out of 10
              </span>
            </div>
            <div className="mt-4">
              <Badge tone={verdict.tone}>{verdict.label}</Badge>
            </div>
          </div>

          {/* AI Comprehensive Feedback */}
          <div className="flex flex-col gap-4 border-t sm:border-t-0 sm:border-l border-white/10 pt-6 sm:pt-0 sm:pl-8">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-ink font-mono">
              <TrendingUp className="size-4 text-cyan" />
              <span>Interviewer Synthesis</span>
            </div>
            <p className="font-sans text-sm text-ink/90 leading-relaxed">
              {session.feedback ||
                'Candidate demonstrated technical understanding of the core fundamental concepts with clear structured communication.'}
            </p>
            <div className="flex flex-wrap gap-2 pt-2">
              <div className="rounded-ctl bg-white/5 border border-white/10 px-3 py-1.5 text-xs text-muted">
                <span className="text-ink font-semibold">{answeredQuestions.length}</span> questions answered
              </div>
              <div className="rounded-ctl bg-white/5 border border-white/10 px-3 py-1.5 text-xs text-muted">
                Difficulty: <span className="text-ink font-semibold">{session.difficulty}</span>
              </div>
            </div>
          </div>
        </div>
      </GlassCard>

      {/* Full Question-by-Question Accordion Review */}
      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div className="flex items-center gap-2">
            <ListOrdered className="size-4 text-cyan" />
            <h3 className="font-display text-lg font-bold text-ink">Turn-by-Turn Breakdown</h3>
          </div>
          <span className="font-sans text-xs text-muted">
            {answeredQuestions.length} Evaluated Responses
          </span>
        </div>

        <div className="flex flex-col gap-3">
          {session.questions.map((q, idx) => {
            const isOpen = Boolean(openAccordions[idx])
            const qScore = q.score ?? 0

            return (
              <GlassCard key={idx} className="p-0 overflow-hidden transition-all duration-200">
                {/* Accordion Header */}
                <button
                  type="button"
                  onClick={() => toggleAccordion(idx)}
                  className="w-full flex items-center justify-between gap-4 p-5 text-left hover:bg-white/[0.03] transition-colors"
                >
                  <div className="flex items-start gap-3.5">
                    <span className="grid size-7 place-items-center rounded-full bg-white/10 font-mono text-xs font-bold text-ink shrink-0 mt-0.5">
                      {idx + 1}
                    </span>
                    <div>
                      <h4 className="font-display text-sm font-semibold text-ink line-clamp-2">
                        {q.question}
                      </h4>
                      {q.topic && <span className="text-[11px] font-mono text-muted">{q.topic}</span>}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    {q.score !== undefined ? (
                      <Badge tone={qScore >= 7 ? 'ok' : 'warn'}>{qScore}/10</Badge>
                    ) : (
                      <Badge tone="run">Unanswered</Badge>
                    )}
                    {isOpen ? (
                      <ChevronUp className="size-4 text-muted" />
                    ) : (
                      <ChevronDown className="size-4 text-muted" />
                    )}
                  </div>
                </button>

                {/* Accordion Expanded Details */}
                {isOpen && (
                  <div className="border-t border-white/10 p-5 bg-black/20 flex flex-col gap-4">
                    {/* Candidate Answer */}
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2 text-xs font-semibold text-cyan">
                        <MessageSquare className="size-3.5" />
                        <span>Your Answer</span>
                      </div>
                      <div className="rounded-ctl bg-white/5 p-3.5 border border-white/5 font-sans text-xs text-ink/90 leading-relaxed">
                        {q.answer || <span className="italic text-muted">No response submitted.</span>}
                      </div>
                    </div>

                    {/* AI Feedback & Coaching */}
                    {q.feedback && (
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2 text-xs font-semibold text-ok">
                          <CheckCircle2 className="size-3.5" />
                          <span>AI Feedback & Suggestions</span>
                        </div>
                        <div className="rounded-ctl bg-ok/5 border border-ok/20 p-3.5 font-sans text-xs text-ink/90 leading-relaxed">
                          {q.feedback}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </GlassCard>
            )
          })}
        </div>
      </section>

      {/* Action Footer Navigation */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-white/10 pt-6">
        <Link to="/interviews">
          <Button variant="secondary">View All Past Sessions</Button>
        </Link>
        <div className="flex items-center gap-3">
          <Link to="/dashboard">
            <Button variant="ghost">Go to Dashboard</Button>
          </Link>
          <Link to="/interview">
            <Button variant="primary" rightIcon={<ArrowRight className="size-4" />}>
              Start Next Interview
            </Button>
          </Link>
        </div>
      </div>
    </div>
  )
}
