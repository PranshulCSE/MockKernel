import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router'
import { motion, AnimatePresence } from 'framer-motion'
import {
  AlertTriangle,
  CheckCircle2,
  Send,
  Flag,
  CheckSquare,
  Sparkles,
  RefreshCw,
  Edit3,
  Mic,
  MicOff,
} from 'lucide-react'
import { Button, GlassCard, Badge, Modal, useToast } from '../components/ui'
import { VoiceOrb } from '../features/interview/VoiceOrb'
import { useSpeechRecognition } from '../features/interview/useSpeechRecognition'
import {
  getInterview,
  submitInterviewAnswer,
  completeInterview,
  abandonInterview,
  type InterviewSession,
  type InterviewEvaluation,
  type StartInterviewResponse,
} from '../api/interviews'
import { ApiClientError } from '../api/client'

export default function InterviewRoomPage() {
  const { id: sessionId } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const toast = useToast()

  // Initial state passed from setup page if available
  const initialData = (location.state as { initialSession?: StartInterviewResponse } | null)
    ?.initialSession

  const [session, setSession] = useState<InterviewSession | null>(null)
  const [currentQuestionText, setCurrentQuestionText] = useState<string>(
    initialData?.question?.question || '',
  )
  const [currentTopic, setCurrentTopic] = useState<string>(
    initialData?.question?.topic || initialData?.topics?.[0] || 'Technical',
  )
  const [questionNumber, setQuestionNumber] = useState<number>(initialData?.questionNumber || 1)
  const [questionCount, setQuestionCount] = useState<number>(initialData?.questionCount || 5)

  const [isLoadingSession, setIsLoadingSession] = useState(!initialData)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isThinkingRetry, setIsThinkingRetry] = useState(false)
  const [latestEvaluation, setLatestEvaluation] = useState<InterviewEvaluation | null>(null)

  // Confirmation Modals
  const [isCompleteModalOpen, setIsCompleteModalOpen] = useState(false)
  const [isAbandonModalOpen, setIsAbandonModalOpen] = useState(false)
  const [isCompleting, setIsCompleting] = useState(false)
  const [isAbandoning, setIsAbandoning] = useState(false)

  // Edge Case E1: Manual typing fallback mode
  const [manualTypingMode, setManualTypingMode] = useState(false)
  const [manualAnswer, setManualAnswer] = useState('')

  // Speech Recognition Hook
  const {
    isSupported,
    isListening,
    transcript,
    interimTranscript,
    audioLevel,
    permissionDenied,
    startListening,
    stopListening,
    resetTranscript,
    setManualTranscript,
  } = useSpeechRecognition()

  // Retain answer across rate-limit retries
  const pendingAnswerRef = useRef<string>('')

  // Load session from backend if not already pre-populated
  useEffect(() => {
    if (!sessionId) return

    let isMounted = true
    const fetchSession = async () => {
      try {
        const data = await getInterview(sessionId)
        if (!isMounted) return
        setSession(data)
        setQuestionCount(data.questionCount)

        if (data.status === 'completed') {
          navigate(`/interview/${sessionId}/summary`, { replace: true })
          return
        }

        // Find unanswered question
        const unansweredIdx = data.questions.findIndex((q) => !q.answeredAt)
        if (unansweredIdx !== -1) {
          setCurrentQuestionText(data.questions[unansweredIdx].question)
          setCurrentTopic(data.questions[unansweredIdx].topic || data.topics[0] || 'Fundamentals')
          setQuestionNumber(unansweredIdx + 1)
        } else if (data.questions.length > 0) {
          const last = data.questions[data.questions.length - 1]
          setCurrentQuestionText(last.question)
          setQuestionNumber(data.questions.length)
        }
      } catch {
        if (!isMounted) return
        toast.error('Could not load interview session.', 'Error')
        navigate('/interviews')
      } finally {
        if (isMounted) setIsLoadingSession(false)
      }
    }

    if (!initialData) {
      void fetchSession()
    }

    return () => {
      isMounted = false
    }
  }, [sessionId, initialData, navigate, toast])

  // Automatically switch to manual typing if speech API unsupported or permission denied (Edge Case E1)
  useEffect(() => {
    if (!isSupported || permissionDenied) {
      const enableTypingFallback = () => setManualTypingMode(true)
      enableTypingFallback()
    }
  }, [isSupported, permissionDenied])

  // Combine speech transcript or manual answer
  const activeAnswer = manualTypingMode ? manualAnswer : transcript

  // Handle voice orb click toggle
  const handleToggleVoice = () => {
    if (isListening) {
      stopListening()
    } else {
      void startListening()
    }
  }

  // Answer submission
  const handleSubmitAnswer = async () => {
    if (!sessionId) return
    const answerToSubmit = (manualTypingMode ? manualAnswer : transcript).trim()

    if (!answerToSubmit) {
      toast.warn('Please provide an answer before submitting.')
      return
    }

    stopListening()
    setIsSubmitting(true)
    setIsThinkingRetry(false)
    pendingAnswerRef.current = answerToSubmit

    try {
      const response = await submitInterviewAnswer(sessionId, answerToSubmit)

      // Turn succeeded!
      setLatestEvaluation(response.evaluation)
      toast.success(
        `Scored ${response.evaluation.score}/10! ${response.evaluation.feedback.slice(0, 60)}...`,
        'Answer Evaluated',
      )

      if (response.isComplete) {
        // Wait 1.5s so candidate sees evaluation before summary
        setTimeout(() => {
          navigate(`/interview/${sessionId}/summary`, {
            state: { summary: response.summary },
          })
        }, 1500)
      } else if (response.nextQuestion) {
        setTimeout(() => {
          setLatestEvaluation(null)
          resetTranscript()
          setManualAnswer('')
          pendingAnswerRef.current = ''
          setCurrentQuestionText(response.nextQuestion?.question || '')
          setCurrentTopic(response.nextQuestion?.topic || 'Core CS')
          if (response.questionNumber) {
            setQuestionNumber(response.questionNumber)
          } else {
            setQuestionNumber((prev) => prev + 1)
          }
          if (!manualTypingMode && isSupported) {
            void startListening()
          }
        }, 1800)
      }
    } catch (err: unknown) {
      // Edge Case E3: AI Rate limit / Busy (Groq 429)
      if (err instanceof ApiClientError && err.status === 429) {
        setIsThinkingRetry(true)
        const delay = (err.retryAfter || 5) * 1000
        toast.info(
          `AI is processing high volume. Retrying automatically in ${err.retryAfter || 5} seconds...`,
          'AI Busy',
        )
        // Automatic retry without discarding student's answer
        setTimeout(() => {
          if (pendingAnswerRef.current) {
            void handleSubmitAnswer()
          }
        }, delay)
      } else {
        const msg = err instanceof Error ? err.message : 'Failed to evaluate answer.'
        toast.error(msg, 'Evaluation Error')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  // Complete session early
  const handleCompleteEarly = async () => {
    if (!sessionId) return
    setIsCompleting(true)
    try {
      await completeInterview(sessionId)
      toast.success('Session finalized early.', 'Interview Completed')
      navigate(`/interview/${sessionId}/summary`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not complete session.'
      toast.error(msg)
    } finally {
      setIsCompleting(false)
      setIsCompleteModalOpen(false)
    }
  }

  // Abandon session
  const handleAbandon = async () => {
    if (!sessionId) return
    setIsAbandoning(true)
    try {
      await abandonInterview(sessionId)
      toast.warn('Interview session abandoned.')
      navigate('/interviews')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not abandon session.'
      toast.error(msg)
    } finally {
      setIsAbandoning(false)
      setIsAbandonModalOpen(false)
    }
  }

  if (isLoadingSession) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
        <RefreshCw className="size-8 animate-spin text-cyan" />
        <p className="font-sans text-sm text-muted">Preparing interview environment...</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-8 max-w-5xl mx-auto pb-16">
      {/* Top Header & HUD */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-4">
        <div className="flex items-center gap-3">
          <Badge tone="run">
            Question {questionNumber} of {questionCount}
          </Badge>
          <Badge tone="ok">{currentTopic}</Badge>
          {session?.difficulty && <Badge tone="warn">{session.difficulty}</Badge>}
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            leftIcon={<CheckSquare className="size-4" />}
            onClick={() => setIsCompleteModalOpen(true)}
          >
            Complete Early
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-bad hover:bg-bad/10 hover:text-bad"
            leftIcon={<Flag className="size-4" />}
            onClick={() => setIsAbandonModalOpen(true)}
          >
            Abandon
          </Button>
        </div>
      </div>

      {/* Edge Case E3: AI Rate Limit / Thinking Banner */}
      <AnimatePresence>
        {isThinkingRetry && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex items-center justify-between gap-4 rounded-ctl border border-warn/30 bg-warn/10 p-4 backdrop-blur-xl shadow-glow"
          >
            <div className="flex items-center gap-3">
              <RefreshCw className="size-5 animate-spin text-warn shrink-0" />
              <div>
                <h5 className="font-display text-sm font-semibold text-ink">
                  AI interviewer is thinking, retrying in a moment...
                </h5>
                <p className="font-sans text-xs text-muted">
                  Your spoken transcript is safely preserved. We are waiting for the AI capacity to free up.
                </p>
              </div>
            </div>
            <Button
              variant="secondary"
              size="sm"
              loading={isSubmitting}
              onClick={() => void handleSubmitAnswer()}
            >
              Retry Now
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Question Card with Smooth Transition */}
      <GlassCard strong className="relative p-6 sm:p-8 overflow-hidden shadow-2xl">
        <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-cyan mb-2">
          <Sparkles className="size-3.5" />
          <span>Interviewer Prompt</span>
        </div>
        <motion.h2
          key={currentQuestionText}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="font-display text-xl sm:text-2xl font-bold leading-relaxed text-ink"
        >
          {currentQuestionText || 'Waiting for the next interview question...'}
        </motion.h2>

        {/* Evaluation feedback alert if scored */}
        <AnimatePresence>
          {latestEvaluation && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-6 border-t border-white/10 pt-4"
            >
              <div className="flex items-start gap-3 rounded-ctl bg-white/5 border border-white/10 p-4">
                <CheckCircle2 className="size-5 text-ok shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-display font-semibold text-sm text-ink">Turn Evaluation:</span>
                    <Badge tone={latestEvaluation.score >= 7 ? 'ok' : 'warn'}>
                      {latestEvaluation.score} / 10
                    </Badge>
                  </div>
                  <p className="font-sans text-xs text-muted leading-relaxed">
                    {latestEvaluation.feedback}
                  </p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </GlassCard>

      {/* Central Hero Voice Orb */}
      <div className="flex flex-col items-center justify-center gap-4 py-4">
        <VoiceOrb
          isListening={isListening}
          audioLevel={audioLevel}
          isThinking={isSubmitting || isThinkingRetry}
          isMuted={manualTypingMode}
          onClick={handleToggleVoice}
        />
        <div className="flex items-center gap-2 text-xs font-sans text-muted">
          {manualTypingMode ? (
            <span className="text-muted">Microphone disabled. Typing mode active.</span>
          ) : isListening ? (
            <span className="flex items-center gap-1.5 text-cyan font-medium animate-pulse">
              <Mic className="size-3.5" /> Listening... Speak clearly
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-muted">
              <MicOff className="size-3.5" /> Microphone paused. Click orb to speak.
            </span>
          )}
        </div>
      </div>

      {/* Edge Case E1: Microphone Denied / Unsupported Inline Glass Banner */}
      <AnimatePresence>
        {(!isSupported || permissionDenied) && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="flex items-start gap-3 rounded-ctl border border-cyan/30 bg-cyan/10 p-4 backdrop-blur-xl"
          >
            <AlertTriangle className="size-5 text-cyan shrink-0 mt-0.5" />
            <div className="flex-1">
              <h5 className="font-display text-sm font-semibold text-ink">
                Microphone Access Unavailable
              </h5>
              <p className="font-sans text-xs text-muted leading-relaxed mt-0.5">
                Microphone permission is blocked or unsupported in this environment. A manual input
                editor is open below so you can type your answers without breaking the session.
              </p>
            </div>
            <Button
              variant="secondary"
              size="sm"
              leftIcon={<Edit3 className="size-3.5" />}
              onClick={() => setManualTypingMode(true)}
            >
              Manual Typing
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Live Transcript / Manual Textarea Area */}
      <GlassCard className="p-5 sm:p-6 flex flex-col gap-4">
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div className="flex items-center gap-2">
            <span className="font-sans text-xs font-semibold text-ink uppercase tracking-wider">
              {manualTypingMode ? 'Typed Answer' : 'Speech Transcript'}
            </span>
            {isListening && !manualTypingMode && (
              <span className="size-2 rounded-full bg-cyan animate-ping" />
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              if (!manualTypingMode) {
                setManualAnswer(transcript)
              } else {
                setManualTranscript(manualAnswer)
              }
              setManualTypingMode(!manualTypingMode)
            }}
            className="font-sans text-xs text-cyan hover:underline flex items-center gap-1"
          >
            {manualTypingMode ? 'Switch to Voice Input' : 'Switch to Typing Mode'}
          </button>
        </div>

        {manualTypingMode ? (
          <textarea
            value={manualAnswer}
            onChange={(e) => setManualAnswer(e.target.value)}
            placeholder="Type your explanation and technical details here..."
            rows={5}
            className="w-full rounded-ctl border border-white/10 bg-black/30 p-3 font-sans text-sm text-ink placeholder-muted focus:border-cyan focus:outline-none focus:ring-1 focus:ring-cyan resize-y"
          />
        ) : (
          <div className="min-h-[100px] max-h-56 overflow-y-auto rounded-ctl bg-black/20 p-4 border border-white/5 font-sans text-sm leading-relaxed">
            {transcript ? (
              <span className="text-ink">{transcript}</span>
            ) : (
              <span className="text-muted/60 italic">
                {isListening
                  ? 'Start speaking your answer... Live transcript will appear here.'
                  : 'Microphone is inactive. Click the Voice Orb above to start speaking, or switch to typing mode.'}
              </span>
            )}
            {interimTranscript && (
              <span className="text-muted/70 italic ml-1">{interimTranscript}</span>
            )}
          </div>
        )}

        {/* Action Controls */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <div className="text-xs text-muted">
            {activeAnswer ? `${activeAnswer.split(/\s+/).filter(Boolean).length} words recorded` : ''}
          </div>

          <div className="flex items-center gap-3">
            {!manualTypingMode && transcript && (
              <Button
                variant="ghost"
                size="sm"
                onClick={resetTranscript}
                disabled={isSubmitting}
              >
                Clear Transcript
              </Button>
            )}
            <Button
              variant="primary"
              size="md"
              loading={isSubmitting}
              leftIcon={<Send className="size-4" />}
              onClick={handleSubmitAnswer}
              disabled={!activeAnswer.trim() || isSubmitting}
            >
              Submit Answer
            </Button>
          </div>
        </div>
      </GlassCard>

      {/* Complete Early Modal */}
      <Modal
        isOpen={isCompleteModalOpen}
        onClose={() => setIsCompleteModalOpen(false)}
        title="Complete Interview Early?"
        description="Are you sure you want to finish now? Your current answers will be scored and final feedback will be generated."
        footer={
          <>
            <Button variant="ghost" onClick={() => setIsCompleteModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" loading={isCompleting} onClick={handleCompleteEarly}>
              Complete & View Summary
            </Button>
          </>
        }
      >
        <p className="font-sans text-xs text-muted">
          Questions answered so far will be evaluated by the AI interviewer to compute your overall score.
        </p>
      </Modal>

      {/* Abandon Modal */}
      <Modal
        isOpen={isAbandonModalOpen}
        onClose={() => setIsAbandonModalOpen(false)}
        title="Abandon Interview?"
        description="This will mark the current session as abandoned. Unsaved progress for the current question will be discarded."
        footer={
          <>
            <Button variant="ghost" onClick={() => setIsAbandonModalOpen(false)}>
              Keep Practicing
            </Button>
            <Button
              variant="primary"
              className="bg-bad hover:bg-bad/90"
              loading={isAbandoning}
              onClick={handleAbandon}
            >
              Abandon Session
            </Button>
          </>
        }
      >
        <p className="font-sans text-xs text-muted">
          You can return to the dashboard or start a fresh interview anytime.
        </p>
      </Modal>
    </div>
  )
}
