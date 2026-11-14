import { useState } from 'react'
import { useNavigate, Link } from 'react-router'
import { Info, Mic, History, Sparkles } from 'lucide-react'
import { Button, Chip, GlassCard, useToast } from '../components/ui'
import { VoiceOrb } from '../features/interview/VoiceOrb'
import { startInterview } from '../api/interviews'

const availableTopics = ['Operating Systems', 'DBMS', 'Data Structures'] as const
const difficultyLevels = ['Easy', 'Medium', 'Hard'] as const
const questionCounts = [5, 8, 10] as const

export default function InterviewPage() {
  const navigate = useNavigate()
  const toast = useToast()

  const [topics, setTopics] = useState<string[]>([...availableTopics])
  const [difficulty, setDifficulty] = useState<(typeof difficultyLevels)[number]>('Medium')
  const [questionCount, setQuestionCount] = useState<(typeof questionCounts)[number]>(5)
  const [isStarting, setIsStarting] = useState(false)

  const toggleTopic = (t: string) => {
    setTopics((prev) =>
      prev.includes(t) ? (prev.length > 1 ? prev.filter((item) => item !== t) : prev) : [...prev, t],
    )
  }

  const handleStart = async () => {
    if (topics.length === 0) {
      toast.warn('Please select at least one topic for your interview.')
      return
    }

    setIsStarting(true)
    try {
      const response = await startInterview({
        topics,
        difficulty,
        questionCount,
      })
      toast.success('Interview session initiated!', 'Ready to Begin')
      navigate(`/interview/${response.sessionId || response.id}`, {
        state: { initialSession: response },
      })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to start interview.'
      toast.error(message, 'Could Not Start Session')
    } finally {
      setIsStarting(false)
    }
  }

  return (
    <div className="flex flex-col gap-12 max-w-5xl mx-auto">
      {/* Hero Section */}
      <section className="grid items-center gap-10 lg:grid-cols-[1.2fr_1fr]">
        <div className="flex flex-col items-start gap-5">
          <div className="inline-flex items-center gap-2 rounded-full border border-cyan/20 bg-cyan/10 px-3.5 py-1 text-xs font-semibold text-cyan">
            <Sparkles className="size-3.5" />
            AI Voice Interviewer
          </div>
          <h1 className="font-display text-4xl sm:text-5xl font-bold leading-tight tracking-tight text-ink">
            Master Technical Behavioral & Fundamentals
          </h1>
          <p className="max-w-lg font-sans text-base sm:text-lg text-muted leading-relaxed">
            Answer computer science questions out loud. The AI interviewer evaluates each response in real
            time, awards scores, provides instant coaching, and dynamically adjusts difficulty.
          </p>
          <div className="flex items-center gap-4 pt-2">
            <Link to="/interviews">
              <Button variant="secondary" leftIcon={<History className="size-4" />}>
                View Past History
              </Button>
            </Link>
          </div>
        </div>

        <div className="flex justify-center">
          <VoiceOrb isListening={false} />
        </div>
      </section>

      {/* Setup Form Card */}
      <GlassCard strong className="flex flex-col gap-8 p-6 sm:p-8" aria-labelledby="setup-title">
        <div className="border-b border-white/10 pb-4">
          <h2 id="setup-title" className="font-display text-xl sm:text-2xl font-bold text-ink">
            Configure Interview Session
          </h2>
          <p className="mt-1 font-sans text-xs text-muted">
            Customize subjects, algorithmic complexity, and number of questions.
          </p>
        </div>

        {/* Topics selection */}
        <fieldset className="flex flex-col gap-3">
          <legend className="font-sans text-sm font-semibold text-ink">Select Topics (Multi-select)</legend>
          <div className="flex flex-wrap gap-2.5">
            {availableTopics.map((t) => (
              <Chip key={t} selected={topics.includes(t)} onClick={() => toggleTopic(t)}>
                {t}
              </Chip>
            ))}
          </div>
        </fieldset>

        {/* Difficulty & Count */}
        <div className="grid gap-8 sm:grid-cols-2">
          <fieldset className="flex flex-col gap-3">
            <legend className="font-sans text-sm font-semibold text-ink">Difficulty</legend>
            <div className="flex flex-wrap gap-2.5">
              {difficultyLevels.map((lvl) => (
                <Chip key={lvl} selected={difficulty === lvl} onClick={() => setDifficulty(lvl)}>
                  {lvl}
                </Chip>
              ))}
            </div>
          </fieldset>

          <fieldset className="flex flex-col gap-3">
            <legend className="font-sans text-sm font-semibold text-ink">Question Count</legend>
            <div className="flex flex-wrap gap-2.5">
              {questionCounts.map((cnt) => (
                <Chip key={cnt} selected={questionCount === cnt} onClick={() => setQuestionCount(cnt)}>
                  {cnt} questions
                </Chip>
              ))}
            </div>
          </fieldset>
        </div>

        <div className="flex items-start gap-3 rounded-ctl border border-cyan/20 bg-cyan/5 p-4 text-xs text-muted">
          <Info className="mt-0.5 size-4 shrink-0 text-cyan" aria-hidden="true" />
          <span>
            Voice input requires microphone access. If your microphone is unavailable or blocked,
            the interview will smoothly slide open a clean text editor so you can type answers without interruption.
          </span>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-white/10 pt-6">
          <div className="text-xs text-muted font-sans">
            Ready to challenge yourself on <span className="text-ink font-semibold">{topics.join(', ')}</span>?
          </div>
          <Button
            size="lg"
            variant="primary"
            loading={isStarting}
            leftIcon={<Mic className="size-5" />}
            onClick={handleStart}
          >
            Start Interview
          </Button>
        </div>
      </GlassCard>
    </div>
  )
}
