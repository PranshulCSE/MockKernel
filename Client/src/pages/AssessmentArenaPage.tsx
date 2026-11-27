import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router'
import Editor, { type Monaco, type OnMount } from '@monaco-editor/react'
import {
  ShieldAlert,
  Clock,
  Play,
  Send,
  Maximize,
  CheckCircle2,
  FileCode,
  Terminal,
  RefreshCw,
  AlertCircle,
} from 'lucide-react'
import {
  assessmentsApi,
  getApiErrorMessage,
  type AssessmentCodeSubmission,
  type AssessmentProblem,
  type AssessmentSessionState,
} from '../api/assessments'
import { runCode } from '../api/problems'
import { useSocket } from '../hooks/useSocket'
import { useProctoringLock } from '../hooks/useProctoringLock'
import { StrikeWarningModal } from '../components/proctoring/StrikeWarningModal'
import { ProctorCamera } from '../components/proctoring/ProctorCamera'
import { Button, GlassCard, Badge, ResizablePanels } from '../components/ui'
import { useAuthStore } from '../store/authStore'
import { useThemeStore } from '../store/themeStore'
import type { VerdictUpdatePayload } from '../types/socket'

interface KeyboardShortcutEvent {
  ctrlKey: boolean
  metaKey: boolean
  code: string
  keyCode?: number
  preventDefault: () => void
  stopPropagation: () => void
}

const LANGUAGES = [
  { id: 'python', name: 'Python 3', monaco: 'python' },
  { id: 'cpp', name: 'C++ 17', monaco: 'cpp' },
  { id: 'java', name: 'Java 17', monaco: 'java' },
  { id: 'javascript', name: 'JavaScript', monaco: 'javascript' },
]

const DEFAULT_STARTER_CODES: Record<string, string> = {
  python: `def solution():\n    # Write your solution here\n    pass\n`,
  cpp: `#include <iostream>\n\nusing namespace std;\n\nint main() {\n    // Write your solution here\n    return 0;\n}\n`,
  java: `public class Solution {\n    public static void main(String[] args) {\n        // Write your solution here\n    }\n}\n`,
  javascript: `function solution() {\n    // Write your solution here\n}\n`,
}

export default function AssessmentArenaPage() {
  const { id: assessmentId } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const theme = useThemeStore((state) => state.theme)
  const { trackSubmission } = useSocket()

  // Arena loading & session states
  const [loading, setLoading] = useState<boolean>(true)
  const [loadError, setLoadError] = useState<string>('')
  const [session, setSession] = useState<AssessmentSessionState | null>(null)
  const [problems, setProblems] = useState<AssessmentProblem[]>([])
  const [deadline, setDeadline] = useState<Date | null>(null)
  const [timeRemainingSeconds, setTimeRemainingSeconds] = useState<number>(0)

  // Problem & Editor state
  const [currentProblemIndex, setCurrentProblemIndex] = useState<number>(0)
  const [language, setLanguage] = useState<string>('python')
  // Map of problemId -> { [lang]: code }
  const [codes, setCodes] = useState<Record<string, Record<string, string>>>({})
  // Map of problemId -> { passed, total, status }
  const [testResults, setTestResults] = useState<
    Record<string, { passed: number; total: number; status: string; output?: string }>
  >({})

  // Running code state
  const [isRunningCode, setIsRunningCode] = useState<boolean>(false)
  const [consoleOutput, setConsoleOutput] = useState<string>('')

  // Submit modal
  const [showSubmitModal, setShowSubmitModal] = useState<boolean>(false)
  const [submittingAssessment, setSubmittingAssessment] = useState<boolean>(false)

  // Current problem
  const currentProblem = problems[currentProblemIndex] || null

  // Helper to get active code for current problem & lang
  const getCurrentCode = useCallback(() => {
    if (!currentProblem) return ''
    const probCodes = codes[currentProblem._id] || {}
    return (
      probCodes[language] ??
      currentProblem.starterCode?.[language] ??
      DEFAULT_STARTER_CODES[language] ??
      ''
    )
  }, [codes, currentProblem, language])

  // Helper to compile submissions map for auto-submit
  const getSubmissionsSnapshot = useCallback(() => {
    const payload: Record<string, AssessmentCodeSubmission> = {}
    for (const p of problems) {
      const probCodes = codes[p._id] || {}
      const c = probCodes[language] ?? p.starterCode?.[language] ?? DEFAULT_STARTER_CODES[language] ?? ''
      const res = testResults[p._id]
      payload[p._id] = {
        code: c,
        language,
        testCasesPassed: res?.passed || 0,
        totalTestCases: res?.total || 0,
      }
    }
    return payload
  }, [codes, language, problems, testResults])

  // Anti-cheat hook integration
  const proctorLock = useProctoringLock({
    assessmentId: assessmentId || '',
    userId: user?.id,
    sessionId: session?.id,
    isActive: Boolean(session && session.status === 'IN_PROGRESS'),
    initialStrikes: session?.strikes || 0,
    getCodeSubmissions: getSubmissionsSnapshot,
    onAutoSubmitted: () => {
      if (session) {
        setSession((prev) =>
          prev
            ? {
                ...prev,
                status: 'AUTO_SUBMITTED_VIOLATION',
                submittedAt: new Date().toISOString(),
              }
            : null
        )
      }
    },
  })

  // Start or resume session on mount
  useEffect(() => {
    if (!assessmentId) return

    let isMounted = true

    const initAssessment = async () => {
      try {
        setLoading(true)
        setLoadError('')
        const data = await assessmentsApi.start(assessmentId)
        if (!isMounted) return

        setSession(data.session)
        setProblems(data.problems)

        const deadlineDate = new Date(data.deadline)
        setDeadline(deadlineDate)

        const diffSeconds = Math.max(0, Math.floor((deadlineDate.getTime() - Date.now()) / 1000))
        setTimeRemainingSeconds(diffSeconds)

        // Prepopulate codes from session or problem starters
        const initialCodes: Record<string, Record<string, string>> = {}
        for (const prob of data.problems) {
          initialCodes[prob._id] = {}
          for (const lang of LANGUAGES) {
            initialCodes[prob._id][lang.id] =
              prob.starterCode?.[lang.id] ?? DEFAULT_STARTER_CODES[lang.id] ?? ''
          }
        }
        setCodes(initialCodes)
      } catch (err) {
        if (!isMounted) return
        setLoadError(getApiErrorMessage(err, 'Failed to initialize assessment session.'))
      } finally {
        if (isMounted) setLoading(false)
      }
    }

    void initAssessment()

    return () => {
      isMounted = false
    }
  }, [assessmentId])

  // Handle timeout auto submit
  const handleAutoSubmitTimeout = useCallback(async () => {
    if (!assessmentId || !session || session.status !== 'IN_PROGRESS') return
    try {
      const submissions = getSubmissionsSnapshot()
      const res = await assessmentsApi.submit(assessmentId, submissions)
      setSession((prev) =>
        prev
          ? {
              ...prev,
              status: 'SUBMITTED',
              score: res.score,
              testCasesPassed: res.testCasesPassed,
              totalTestCases: res.totalTestCases,
              submittedAt: res.submittedAt,
            }
          : null
      )
    } catch (err) {
      console.warn('[AssessmentArena] Timeout submission error:', err)
    }
  }, [assessmentId, session, getSubmissionsSnapshot])

  // Persistent Countdown Timer
  useEffect(() => {
    if (!deadline || !session || session.status !== 'IN_PROGRESS') return

    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.floor((deadline.getTime() - Date.now()) / 1000))
      setTimeRemainingSeconds(remaining)

      if (remaining <= 0) {
        clearInterval(interval)
        // Time expired: auto-submit assessment
        void handleAutoSubmitTimeout()
      }
    }, 1000)

    return () => clearInterval(interval)
  }, [deadline, session, handleAutoSubmitTimeout])

  // Handle manual submit assessment
  const handleManualSubmit = async () => {
    if (!assessmentId || !session) return
    try {
      setSubmittingAssessment(true)
      const submissions = getSubmissionsSnapshot()
      const res = await assessmentsApi.submit(assessmentId, submissions)
      setSession((prev) =>
        prev
          ? {
              ...prev,
              status: 'SUBMITTED',
              score: res.score,
              testCasesPassed: res.testCasesPassed,
              totalTestCases: res.totalTestCases,
              submittedAt: res.submittedAt,
            }
          : null
      )
      setShowSubmitModal(false)
    } catch (err) {
      alert(getApiErrorMessage(err, 'Submission failed.'))
    } finally {
      setSubmittingAssessment(false)
    }
  }

  // Code change in Monaco
  const handleCodeChange = (newCode: string | undefined) => {
    if (!currentProblem || newCode === undefined) return
    setCodes((prev) => ({
      ...prev,
      [currentProblem._id]: {
        ...(prev[currentProblem._id] || {}),
        [language]: newCode,
      },
    }))
  }

  // Run code against sample tests
  const handleRunCode = async () => {
    if (!currentProblem || isRunningCode) return

    try {
      setIsRunningCode(true)
      setConsoleOutput('Executing code against problem test cases...')

      const payload = {
        problemId: currentProblem._id,
        language,
        sourceCode: getCurrentCode(),
      }

      const submission = await runCode(payload)
      const subId = submission?.id || submission?.submissionId

      if (subId) {
        trackSubmission(subId, (update: VerdictUpdatePayload) => {
          setIsRunningCode(false)
          let outputText = `Verdict: ${update.verdict}\n`
          if (update.runtime) outputText += `Runtime: ${update.runtime}ms\n`
          if (update.memory) outputText += `Memory: ${update.memory}KB\n\n`
          if (update.compileOutput) outputText += `Compiler Output:\n${update.compileOutput}\n\n`

          const passedCount = update.testCaseResults?.filter((t) => t.status === 'ACCEPTED').length || 0
          const totalCount = update.testCaseResults?.length || 0

          if (update.testCaseResults && update.testCaseResults.length > 0) {
            outputText += `Test Cases Passed: ${passedCount} / ${totalCount}\n`
            update.testCaseResults.forEach((tc, idx) => {
              outputText += `  Case #${idx + 1}: ${tc.status} (${tc.runtime ?? 0}ms, ${tc.memory ?? 0}KB)\n`
            })
          }

          setConsoleOutput(outputText)
          setTestResults((prev) => ({
            ...prev,
            [currentProblem._id]: {
              passed: passedCount,
              total: totalCount,
              status: update.verdict,
              output: outputText,
            },
          }))
        })
      } else {
        setIsRunningCode(false)
        setConsoleOutput('Code execution started.')
      }
    } catch (err) {
      setIsRunningCode(false)
      setConsoleOutput(`Execution Error: ${getApiErrorMessage(err, 'Execution failed')}`)
    }
  }

  // Monaco theme configuration
  const handleEditorWillMount = (monaco: Monaco) => {
    monaco.editor.defineTheme('mockkernel-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'comment', foreground: '6272a4', fontStyle: 'italic' },
        { token: 'keyword', foreground: '06B6D4' },
        { token: 'string', foreground: '34D399' },
        { token: 'number', foreground: 'F472B6' },
        { token: 'type', foreground: '7C3AED' },
      ],
      colors: {
        'editor.background': '#161B22',
        'editor.foreground': '#F5F5FF',
        'editorLineNumber.foreground': '#9CA3C755',
        'editorLineNumber.activeForeground': '#06B6D4',
        'editor.lineHighlightBackground': '#ffffff08',
        'editorCursor.foreground': '#06B6D4',
        'editor.selectionBackground': '#7C3AED33',
      },
    })

    monaco.editor.defineTheme('mockkernel-light', {
      base: 'vs',
      inherit: true,
      rules: [
        { token: 'comment', foreground: '64748B', fontStyle: 'italic' },
        { token: 'keyword', foreground: '0284C7' },
        { token: 'string', foreground: '059669' },
        { token: 'number', foreground: 'DB2777' },
        { token: 'type', foreground: '7C3AED' },
      ],
      colors: {
        'editor.background': '#F7F9FD',
        'editor.foreground': '#1E293B',
        'editorLineNumber.foreground': '#64748B99',
        'editorLineNumber.activeForeground': '#0284C7',
        'editor.lineHighlightBackground': '#0F172A0A',
        'editorCursor.foreground': '#0284C7',
        'editor.selectionBackground': '#0EA5E933',
      },
    })
  }

  // Monaco onMount lockdown (disable context menu, intercept copy/paste and inspector keys)
  const handleEditorMount: OnMount = (editor) => {
    // Intercept keyboard shortcuts in Monaco
    editor.onKeyDown((e: KeyboardShortcutEvent) => {
      // Prevent copy / paste
      if (
        (e.ctrlKey || e.metaKey) &&
        (e.code === 'KeyC' || e.code === 'KeyV' || e.keyCode === 33 || e.keyCode === 52)
      ) {
        e.preventDefault()
        e.stopPropagation()
      }
      // Prevent F12
      if (e.code === 'F12' || e.keyCode === 123) {
        e.preventDefault()
        e.stopPropagation()
      }
    })

    // DOM event listeners on editor container
    const domNode = editor.getDomNode()
    if (domNode) {
      domNode.addEventListener(
        'paste',
        (e: ClipboardEvent) => {
          e.preventDefault()
          e.stopPropagation()
        },
        true
      )
      domNode.addEventListener(
        'copy',
        (e: ClipboardEvent) => {
          e.preventDefault()
          e.stopPropagation()
        },
        true
      )
      domNode.addEventListener('contextmenu', (e: MouseEvent) => {
        e.preventDefault()
        e.stopPropagation()
      })
    }
  }

  // Format seconds to mm:ss or hh:mm:ss
  const formatTimer = (totalSeconds: number) => {
    const hours = Math.floor(totalSeconds / 3600)
    const minutes = Math.floor((totalSeconds % 3600) / 60)
    const seconds = totalSeconds % 60
    if (hours > 0) {
      return `${hours.toString().padStart(2, '0')}:${minutes
        .toString()
        .padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
    }
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
  }

  // Render Loading state
  if (loading) {
    return (
      <div className="flex h-[80vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-muted">
          <RefreshCw className="size-8 animate-spin text-cyan" />
          <p className="font-mono text-sm">Locking into assessment environment...</p>
        </div>
      </div>
    )
  }

  // Render Load Error state
  if (loadError || !session) {
    return (
      <div className="mx-auto max-w-xl p-8">
        <GlassCard className="p-8 text-center space-y-4">
          <AlertCircle className="size-12 text-bad mx-auto" />
          <h2 className="text-xl font-bold font-display text-ink">Cannot Join Arena</h2>
          <p className="text-sm text-muted">{loadError || 'Assessment could not be loaded.'}</p>
          <Button variant="primary" onClick={() => navigate('/assessments/join')}>
            Back to Assessment Portal
          </Button>
        </GlassCard>
      </div>
    )
  }

  const isSessionFinalized = session.status !== 'IN_PROGRESS'

  // Render Finalized / Submitted View
  if (isSessionFinalized) {
    const isDisqualified =
      session.status === 'AUTO_SUBMITTED_VIOLATION' ||
      session.status === 'AUTO_SUBMITTED_PAGE_RELOAD'

    return (
      <div className="mx-auto max-w-2xl px-4 py-12">
        <GlassCard className="p-8 text-center space-y-6">
          <div
            className={`mx-auto flex size-20 items-center justify-center rounded-full ${
              isDisqualified ? 'bg-bad/15 text-bad' : 'bg-good/15 text-good'
            }`}
          >
            {isDisqualified ? (
              <ShieldAlert className="size-10" />
            ) : (
              <CheckCircle2 className="size-10" />
            )}
          </div>

          <div>
            <Badge tone={isDisqualified ? 'bad' : 'run'} className="mb-2">
              {session.status}
            </Badge>
            <h1 className="text-2xl sm:text-3xl font-bold font-display text-ink">
              {isDisqualified
                ? 'Assessment Terminated for Violation'
                : 'Assessment Successfully Submitted'}
            </h1>
            <p className="text-sm text-muted mt-2 max-w-md mx-auto leading-relaxed">
              {isDisqualified
                ? 'Your session was automatically concluded due to repeated anti-cheat strikes or navigation away from the exam.'
                : 'Your solutions have been safely recorded and your score has been finalized in the system.'}
            </p>
          </div>

          <div className="grid grid-cols-3 gap-3 p-4 rounded-xl border border-line bg-surface-soft">
            <div>
              <div className="text-xs text-muted">Final Score</div>
              <div className="text-xl font-bold font-mono text-cyan mt-1">
                {session.score ?? 0}%
              </div>
            </div>
            <div>
              <div className="text-xs text-muted">Test Cases Passed</div>
              <div className="text-xl font-bold font-mono text-ink mt-1">
                {session.testCasesPassed ?? 0}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted">Strikes Accrued</div>
              <div
                className={`text-xl font-bold font-mono mt-1 ${
                  session.strikes >= 3 ? 'text-bad' : 'text-good'
                }`}
              >
                {session.strikes} / 3
              </div>
            </div>
          </div>

          <Button
            variant="primary"
            onClick={() => navigate('/dashboard')}
            className="w-full justify-center py-3 text-sm font-semibold"
          >
            Return to Dashboard
          </Button>
        </GlassCard>
      </div>
    )
  }

  // Active Test Arena View
  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-base overflow-hidden select-none">
      {/* Strike Warning Modal (Strike 1 or 2) */}
      <StrikeWarningModal
        isOpen={proctorLock.warningModalOpen}
        strikes={proctorLock.strikes}
        message={proctorLock.warningMessage}
        onAcknowledge={proctorLock.dismissWarningModal}
      />

      {/* Floating AI Proctor Webcam Widget */}
      <ProctorCamera
        assessmentId={assessmentId || ''}
        isActive={session.status === 'IN_PROGRESS'}
      />

      {/* Fullscreen Initial Blocker Overlay (Candidate must enter fullscreen) */}
      {!proctorLock.isFullscreen && !proctorLock.warningModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 backdrop-blur-lg">
          <div className="max-w-md w-full rounded-2xl border border-cyan/40 bg-base/95 p-8 text-center space-y-5 shadow-2xl shadow-cyan/20">
            <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-cyan/15 text-cyan">
              <Maximize className="size-8" />
            </div>
            <div>
              <h2 className="text-xl font-bold font-display text-ink">
                Fullscreen Enforcement Required
              </h2>
              <p className="text-xs sm:text-sm text-muted mt-2 leading-relaxed">
                To prevent test interference and maintain security, the proctored assessment arena
                must operate in strict fullscreen mode.
              </p>
            </div>
            <Button
              variant="primary"
              onClick={() => void proctorLock.requestFullscreen()}
              className="w-full justify-center py-3 text-sm font-semibold shadow-glow"
            >
              Enter Fullscreen Mode
            </Button>
          </div>
        </div>
      )}

      {/* Top Arena Navigation / Control Bar */}
      <header className="h-14 border-b border-line workspace-toolbar px-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <ShieldAlert className="size-5 text-cyan" />
            <span className="font-display text-sm font-bold text-ink hidden sm:inline">
              MockKernel Proctored Assessment
            </span>
          </div>

          {/* Problem Tabs */}
          <div className="flex items-center gap-1.5 ml-2 border-l border-line pl-3">
            {problems.map((prob, idx) => (
              <button
                key={prob._id}
                onClick={() => setCurrentProblemIndex(idx)}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                  idx === currentProblemIndex
                    ? 'bg-cyan/20 text-cyan border border-cyan/40 font-semibold'
                    : 'text-muted hover:text-ink hover:bg-surface-soft border border-transparent'
                }`}
              >
                Problem {idx + 1}
              </button>
            ))}
          </div>
        </div>

        {/* Center: Countdown Timer */}
        <div className="flex items-center gap-2">
          <div
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-mono font-bold ${
              timeRemainingSeconds < 300
                ? 'bg-bad/20 text-bad border-bad/40 animate-pulse'
                : 'bg-surface-soft text-ink border-line'
            }`}
          >
            <Clock className="size-3.5" />
            <span>{formatTimer(timeRemainingSeconds)}</span>
          </div>

          {/* Strikes Counter Indicator */}
          <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-surface-soft border border-line text-xs">
            <span className="text-[11px] text-muted mr-1">Strikes:</span>
            {[1, 2, 3].map((s) => (
              <span
                key={s}
                className={`size-2 rounded-full ${
                  s <= proctorLock.strikes ? 'bg-bad' : 'bg-line'
                }`}
              />
            ))}
          </div>
        </div>

        {/* Right: Submit Assessment Action */}
        <div className="flex items-center gap-3">
          <Button
            variant="primary"
            size="sm"
            onClick={() => setShowSubmitModal(true)}
            className="text-xs font-semibold bg-good hover:bg-good/80 text-white border-none shadow-glow"
          >
            <Send className="size-3.5 mr-1.5" />
            Submit Assessment
          </Button>
        </div>
      </header>

      {/* Main Workspace Resizable Panels */}
      <div className="flex-1 overflow-hidden">
        {currentProblem ? (
          <ResizablePanels
            direction="horizontal"
            initialSplit={45}
            minSplit={30}
            maxSplit={70}
            first={
              /* Left Panel: Problem Statement & Details */
              <div className="h-full overflow-y-auto p-6 space-y-6 bg-base">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-mono text-cyan">
                      Problem {currentProblemIndex + 1} of {problems.length}
                    </span>
                    <Badge
                      tone={
                        currentProblem.difficulty === 'Easy'
                          ? 'run'
                          : currentProblem.difficulty === 'Medium'
                          ? 'flag'
                          : 'bad'
                      }
                    >
                      {currentProblem.difficulty}
                    </Badge>
                  </div>
                  <h1 className="text-xl sm:text-2xl font-bold font-display text-ink">
                    {currentProblem.title}
                  </h1>
                </div>

                {/* Statement text */}
                <div className="prose prose-sm max-w-none text-muted leading-relaxed whitespace-pre-line font-sans">
                  {currentProblem.statement}
                </div>

                {/* Constraints */}
                {currentProblem.constraints && (
                  <div className="rounded-xl border border-line bg-surface-soft p-4 space-y-1.5">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-ink">
                      Constraints
                    </h3>
                    <p className="text-xs font-mono text-muted whitespace-pre-line leading-relaxed">
                      {currentProblem.constraints}
                    </p>
                  </div>
                )}
              </div>
            }
            second={
              /* Right Panel: Monaco Editor & Console Split */
              <div className="h-full flex flex-col workspace-editor">
                {/* Editor Header */}
                <div className="flex items-center justify-between border-b border-line workspace-toolbar px-4 py-2 shrink-0">
                  <div className="flex items-center gap-2">
                    <FileCode className="size-4 text-cyan" />
                    <select
                      value={language}
                      onChange={(e) => setLanguage(e.target.value)}
                      className="rounded-lg border border-line bg-surface-soft px-2.5 py-1 text-xs font-medium text-ink focus:border-cyan focus:outline-none"
                    >
                      {LANGUAGES.map((l) => (
                        <option key={l.id} value={l.id} className="bg-base text-ink">
                          {l.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Run Code Button */}
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={isRunningCode}
                      onClick={() => void handleRunCode()}
                      className="text-xs text-cyan hover:text-cyan hover:bg-cyan/10"
                    >
                      {isRunningCode ? (
                        <>
                          <RefreshCw className="size-3.5 animate-spin mr-1.5" />
                          Running...
                        </>
                      ) : (
                        <>
                          <Play className="size-3.5 mr-1.5" />
                          Run Code
                        </>
                      )}
                    </Button>
                  </div>
                </div>

                {/* Resizable Code Editor + Bottom Console */}
                <div className="flex-1 overflow-hidden">
                  <ResizablePanels
                    direction="vertical"
                    initialSplit={65}
                    minSplit={30}
                    maxSplit={85}
                    first={
                      <div className="size-full">
                        <Editor
                          height="100%"
                          language={LANGUAGES.find((l) => l.id === language)?.monaco || 'python'}
                          value={getCurrentCode()}
                          onChange={handleCodeChange}
                          beforeMount={handleEditorWillMount}
                          onMount={handleEditorMount}
                          theme={theme === 'light' ? 'mockkernel-light' : 'mockkernel-dark'}
                          options={{
                            fontSize: 14,
                            fontFamily: '"JetBrains Mono Variable", monospace',
                            minimap: { enabled: false },
                            scrollBeyondLastLine: false,
                            automaticLayout: true,
                            lineNumbers: 'on',
                            contextmenu: false, // Locked down right click
                            cursorBlinking: 'smooth',
                            smoothScrolling: true,
                            padding: { top: 12, bottom: 12 },
                          }}
                        />
                      </div>
                    }
                    second={
                      <div className="size-full flex flex-col workspace-toolbar border-t border-line">
                        <div className="flex items-center gap-2 px-4 py-1.5 border-b border-line text-xs font-medium text-muted">
                          <Terminal className="size-3.5 text-cyan" />
                          <span>Execution Console</span>
                        </div>
                        <div className="flex-1 overflow-y-auto p-4 font-mono text-xs text-muted whitespace-pre-wrap">
                          {consoleOutput || 'Click "Run Code" to test against problem test cases.'}
                        </div>
                      </div>
                    }
                  />
                </div>
              </div>
            }
          />
        ) : (
          <div className="flex size-full items-center justify-center text-muted">
            No problems found in assessment.
          </div>
        )}
      </div>

      {/* Confirmation Submit Modal */}
      {showSubmitModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/35 p-4 backdrop-blur-md">
          <div className="max-w-md w-full rounded-2xl border border-line bg-base/95 p-6 space-y-4 shadow-2xl">
            <h3 className="text-lg font-bold font-display text-ink">
              Submit Assessment Solutions?
            </h3>
            <p className="text-xs sm:text-sm text-muted leading-relaxed">
              Are you sure you want to finalize and submit your assessment? Once submitted, your
              session will be closed and you cannot make further changes.
            </p>

            <div className="p-3 rounded-xl border border-line bg-surface-soft text-xs text-muted space-y-1">
              <div>Total Problems: <span className="font-semibold text-ink">{problems.length}</span></div>
              <div>Time Left: <span className="font-semibold text-cyan">{formatTimer(timeRemainingSeconds)}</span></div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowSubmitModal(false)}
                disabled={submittingAssessment}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => void handleManualSubmit()}
                disabled={submittingAssessment}
                className="bg-good hover:bg-good/80 text-white border-none shadow-glow"
              >
                {submittingAssessment ? 'Submitting...' : 'Yes, Finalize & Submit'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
