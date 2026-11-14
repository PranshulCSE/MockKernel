import { useState } from 'react'
import { useNavigate, Link } from 'react-router'
import {
  Info,
  Mic,
  History,
  Sparkles,
  Plus,
  Check,
  AlertCircle,
  X,
  CheckCircle2,
} from 'lucide-react'
import { Button, Chip, GlassCard, useToast } from '../components/ui'
import { VoiceOrb } from '../features/interview/VoiceOrb'
import { startInterview } from '../api/interviews'
import { cn } from '../lib/cn'

const defaultPresetTopics = [
  'Operating Systems',
  'DBMS',
  'Data Structures',
  'MERN Stack',
  'Python',
  'System Design',
  'React & Frontend',
  'DevOps & Cloud',
] as const

const difficultyLevels = ['Easy', 'Medium', 'Hard'] as const
const questionCounts = [5, 8, 10] as const

// Comprehensive dictionary of recognized technical subjects, frameworks, languages, and concepts
const RECOGNIZED_TECH_DOMAINS = [
  'mern', 'mern stack', 'mean', 'mean stack', 'python', 'javascript', 'typescript',
  'java', 'c++', 'cpp', 'c#', 'c programming', 'golang', 'go', 'rust', 'ruby', 'php',
  'swift', 'kotlin', 'scala', 'dart', 'r programming', 'sql', 'nosql', 'html', 'css',
  'react', 'react.js', 'react native', 'next.js', 'nextjs', 'node', 'node.js', 'nodejs',
  'express', 'express.js', 'django', 'flask', 'fastapi', 'spring', 'spring boot', 'vue',
  'vue.js', 'angular', 'laravel', 'asp.net', '.net', 'flutter', 'tailwind', 'redux',
  'graphql', 'operating systems', 'os', 'dbms', 'database', 'data structures', 'dsa',
  'algorithms', 'computer networks', 'networking', 'system design', 'oop', 'oops',
  'low level design', 'high level design', 'microservices', 'distributed systems',
  'rest api', 'restful api', 'mongodb', 'mysql', 'postgresql', 'postgres', 'redis',
  'cassandra', 'dynamodb', 'sqlite', 'docker', 'kubernetes', 'k8s', 'devops', 'aws',
  'azure', 'gcp', 'cloud computing', 'linux', 'git', 'ci/cd', 'kafka', 'rabbitmq',
  'machine learning', 'deep learning', 'artificial intelligence', 'ai', 'data science',
  'nlp', 'computer vision', 'pytorch', 'tensorflow', 'pandas', 'numpy', 'cyber security',
  'web security', 'blockchain', 'solidity', 'web3', 'testing', 'jest', 'cypress',
]

/**
 * Validates whether user-entered text is a legitimate technical topic
 */
function verifySubject(raw: string): { valid: boolean; normalized: string; message?: string } {
  const trimmed = raw.trim()
  if (!trimmed) {
    return { valid: false, normalized: '', message: 'Please enter a technical subject or framework name.' }
  }

  if (trimmed.length < 2) {
    return { valid: false, normalized: trimmed, message: 'Subject must be at least 2 characters.' }
  }

  if (trimmed.length > 50) {
    return { valid: false, normalized: trimmed, message: 'Subject name cannot exceed 50 characters.' }
  }

  // Reject invalid symbols or pure punctuation
  if (!/^[a-zA-Z0-9\s.+\-#&/()]+$/.test(trimmed)) {
    return {
      valid: false,
      normalized: trimmed,
      message: 'Subject contains invalid characters. Use letters, numbers, and common symbols like +, #, ., -, &.',
    }
  }

  // Must have at least one letter
  if (!/[a-zA-Z]/.test(trimmed)) {
    return { valid: false, normalized: trimmed, message: 'Subject must contain alphabetic characters.' }
  }

  // Prevent repeated spam like aaaaaa, zzzzzz
  if (/^(.)\1{3,}$/i.test(trimmed)) {
    return { valid: false, normalized: trimmed, message: 'Invalid subject: repetitive characters detected.' }
  }

  const lower = trimmed.toLowerCase()

  // Exact or substring match in technical keywords dictionary
  const isMatch = RECOGNIZED_TECH_DOMAINS.some(
    (domain) => lower === domain || lower.includes(domain) || domain.includes(lower)
  )

  // Multi-word tech phrases (e.g. "React State Management", "Python Concurrency", "Docker Containers")
  const words = lower.split(/[\s/&+-]+/).filter(Boolean)
  const hasTechWord = words.some((w) =>
    RECOGNIZED_TECH_DOMAINS.some((d) => d === w || d.startsWith(w) || w.startsWith(d))
  )

  if (isMatch || hasTechWord || words.length >= 2) {
    // Format to clean title case
    const normalized = trimmed
      .split(' ')
      .map((w) => (w.length <= 3 && !['and', 'for', 'the'].includes(w.toLowerCase()) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)))
      .join(' ')

    return { valid: true, normalized }
  }

  return {
    valid: false,
    normalized: trimmed,
    message: `"${trimmed}" was not recognized as a standard technical domain. Examples: MERN Stack, Python, Golang, Spring Boot, DevOps, Docker.`,
  }
}

export default function InterviewPage() {
  const navigate = useNavigate()
  const toast = useToast()

  // Selected topics list
  const [topics, setTopics] = useState<string[]>(['MERN Stack', 'Python'])
  // Custom added topics
  const [customTopics, setCustomTopics] = useState<string[]>([])
  // User input box state
  const [customInput, setCustomInput] = useState('')
  const [verificationFeedback, setVerificationFeedback] = useState<{
    status: 'idle' | 'success' | 'error'
    message: string
  }>({ status: 'idle', message: '' })

  const [difficulty, setDifficulty] = useState<(typeof difficultyLevels)[number]>('Medium')
  const [questionCount, setQuestionCount] = useState<(typeof questionCounts)[number]>(5)
  const [isStarting, setIsStarting] = useState(false)

  const toggleTopic = (t: string) => {
    setTopics((prev) =>
      prev.includes(t) ? (prev.length > 1 ? prev.filter((item) => item !== t) : prev) : [...prev, t]
    )
  }

  // Handle Verify & Add custom subject
  const handleVerifyAndAdd = (e?: React.FormEvent) => {
    if (e) e.preventDefault()

    const result = verifySubject(customInput)
    if (!result.valid) {
      setVerificationFeedback({
        status: 'error',
        message: result.message || 'Verification failed. Please check the subject name.',
      })
      return
    }

    const newSubject = result.normalized

    // Check if already in list
    if (topics.includes(newSubject) || customTopics.includes(newSubject)) {
      setVerificationFeedback({
        status: 'error',
        message: `"${newSubject}" is already added to your topics list.`,
      })
      return
    }

    // Add to custom list and select it
    setCustomTopics((prev) => [...prev, newSubject])
    setTopics((prev) => [...prev, newSubject])
    setCustomInput('')
    setVerificationFeedback({
      status: 'success',
      message: `Verified: "${newSubject}" is an approved technical subject and has been added!`,
    })

    toast.success(`"${newSubject}" verified and added to interview topics!`, 'Subject Verified')
  }

  const removeCustomTopic = (topicToRemove: string) => {
    setCustomTopics((prev) => prev.filter((t) => t !== topicToRemove))
    setTopics((prev) => (prev.length > 1 ? prev.filter((t) => t !== topicToRemove) : prev))
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
    <div className="flex flex-col gap-10 sm:gap-12 max-w-5xl mx-auto">
      {/* Hero Section */}
      <section className="grid items-center gap-8 lg:gap-10 lg:grid-cols-[1.2fr_1fr]">
        <div className="flex flex-col items-start gap-4 sm:gap-5">
          <div className="inline-flex items-center gap-2 rounded-full border border-cyan/20 bg-cyan/10 px-3.5 py-1 text-xs font-semibold text-cyan shadow-glow-cyan">
            <Sparkles className="size-3.5" />
            AI Voice Technical Interviewer
          </div>
          <h1 className="font-display text-3xl sm:text-5xl font-bold leading-tight tracking-tight text-ink">
            Master Technical Behavioral & Stacks
          </h1>
          <p className="max-w-lg font-sans text-sm sm:text-base text-muted leading-relaxed">
            Practice real technical interviews out loud. Whether you specialize in MERN Stack,
            Python, System Design, or Cloud, our adaptive AI interviewer evaluates your conceptual
            depth, algorithmic trade-offs, and communication clarity in real time.
          </p>
          <div className="flex items-center gap-4 pt-2">
            <Link to="/interviews">
              <Button variant="secondary" leftIcon={<History className="size-4" />}>
                View Past Sessions
              </Button>
            </Link>
          </div>
        </div>

        <div className="flex justify-center">
          <VoiceOrb isListening={false} />
        </div>
      </section>

      {/* Setup Form Card */}
      <GlassCard strong className="flex flex-col gap-8 p-5 sm:p-8 border-white/15" aria-labelledby="setup-title">
        <div className="border-b border-white/10 pb-4">
          <h2 id="setup-title" className="font-display text-xl sm:text-2xl font-bold text-ink">
            Configure Interview Session
          </h2>
          <p className="mt-1 font-sans text-xs sm:text-sm text-muted">
            Choose from preset computer science disciplines or enter your own custom stack (e.g. MERN Stack, Python, Golang).
          </p>
        </div>

        {/* Custom Subject Input Box with Verification */}
        <div className="flex flex-col gap-3 rounded-card border border-cyan/20 bg-cyan/[0.03] p-4 sm:p-5">
          <div className="flex flex-col gap-1">
            <label htmlFor="custom-subject-input" className="text-sm font-semibold text-ink flex items-center gap-2">
              <Plus className="size-4 text-cyan" />
              Add Custom Topic / Stack
            </label>
            <p className="text-xs text-muted">
              Want an interview on MERN Stack, Python, DevOps, or specific technologies? Type it below and verify.
            </p>
          </div>

          <form onSubmit={handleVerifyAndAdd} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-1">
            <div className="relative flex-1">
              <input
                id="custom-subject-input"
                type="text"
                value={customInput}
                onChange={(e) => {
                  setCustomInput(e.target.value)
                  if (verificationFeedback.status !== 'idle') {
                    setVerificationFeedback({ status: 'idle', message: '' })
                  }
                }}
                placeholder="e.g. MERN Stack, Python, Golang, Spring Boot, React Native..."
                className="h-11 w-full rounded-ctl border border-white/10 bg-black/40 px-4 text-sm text-ink placeholder:text-muted/60 transition-colors focus-visible:border-cyan focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan"
              />
            </div>
            <Button
              type="submit"
              variant="secondary"
              className="h-11 px-5 border-cyan/40 text-cyan hover:bg-cyan/15 shrink-0 text-xs font-semibold"
            >
              <Check className="size-4 mr-1.5 text-cyan" />
              Verify & Add Subject
            </Button>
          </form>

          {/* Verification Feedback Banner */}
          {verificationFeedback.status === 'success' && (
            <div className="flex items-center gap-2 rounded-md bg-ok/10 border border-ok/30 px-3 py-2 text-xs text-ok font-medium animate-fadeIn">
              <CheckCircle2 className="size-4 shrink-0 text-ok" />
              <span>{verificationFeedback.message}</span>
            </div>
          )}

          {verificationFeedback.status === 'error' && (
            <div className="flex items-center gap-2 rounded-md bg-bad/10 border border-bad/30 px-3 py-2 text-xs text-bad font-medium animate-fadeIn">
              <AlertCircle className="size-4 shrink-0 text-bad" />
              <span>{verificationFeedback.message}</span>
            </div>
          )}
        </div>

        {/* Selected Topics List */}
        <fieldset className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <legend className="font-sans text-sm font-semibold text-ink">
              Selected Topics for Interview ({topics.length} active)
            </legend>
            <span className="text-xs text-muted">Click chips to toggle</span>
          </div>

          <div className="flex flex-wrap gap-2.5">
            {/* Standard Preset Chips */}
            {defaultPresetTopics.map((t) => (
              <Chip key={t} selected={topics.includes(t)} onClick={() => toggleTopic(t)}>
                {t}
              </Chip>
            ))}

            {/* Custom Added Chips */}
            {customTopics.map((ct) => {
              const isSelected = topics.includes(ct)
              return (
                <div
                  key={ct}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-all cursor-pointer',
                    isSelected
                      ? 'border-cyan bg-cyan/20 text-cyan shadow-glow-cyan font-semibold'
                      : 'border-white/10 bg-white/5 text-muted hover:border-white/20 hover:text-ink'
                  )}
                  onClick={() => toggleTopic(ct)}
                >
                  <Sparkles className="size-3 text-cyan" />
                  <span>{ct}</span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      removeCustomTopic(ct)
                    }}
                    className="ml-1 rounded-full p-0.5 hover:bg-white/20 text-muted hover:text-bad transition-colors"
                    title="Remove custom topic"
                  >
                    <X className="size-3" />
                  </button>
                </div>
              )
            })}
          </div>
        </fieldset>

        {/* Difficulty & Question Count */}
        <div className="grid gap-6 sm:grid-cols-2">
          <fieldset className="flex flex-col gap-3">
            <legend className="font-sans text-sm font-semibold text-ink">Target Difficulty</legend>
            <div className="flex flex-wrap gap-2.5">
              {difficultyLevels.map((lvl) => (
                <Chip key={lvl} selected={difficulty === lvl} onClick={() => setDifficulty(lvl)}>
                  {lvl}
                </Chip>
              ))}
            </div>
          </fieldset>

          <fieldset className="flex flex-col gap-3">
            <legend className="font-sans text-sm font-semibold text-ink">Interview Length</legend>
            <div className="flex flex-wrap gap-2.5">
              {questionCounts.map((cnt) => (
                <Chip key={cnt} selected={questionCount === cnt} onClick={() => setQuestionCount(cnt)}>
                  {cnt} questions
                </Chip>
              ))}
            </div>
          </fieldset>
        </div>

        {/* Microphone Notice */}
        <div className="flex items-start gap-3 rounded-ctl border border-cyan/20 bg-cyan/5 p-4 text-xs text-muted">
          <Info className="mt-0.5 size-4 shrink-0 text-cyan" aria-hidden="true" />
          <span>
            Voice input requires microphone access. If your microphone is unavailable or blocked,
            the interview room automatically slides open a text answer console so you can type answers seamlessly without interruption.
          </span>
        </div>

        {/* Start Button & Footer Info */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 border-t border-white/10 pt-6">
          <div className="text-xs text-muted font-sans">
            Ready to interview on:{' '}
            <span className="text-cyan font-semibold">{topics.join(', ')}</span>
          </div>
          <Button
            size="lg"
            variant="primary"
            loading={isStarting}
            leftIcon={<Mic className="size-5" />}
            onClick={handleStart}
            className="w-full sm:w-auto font-semibold bg-brand shadow-glow"
          >
            Start Technical Interview
          </Button>
        </div>
      </GlassCard>
    </div>
  )
}
