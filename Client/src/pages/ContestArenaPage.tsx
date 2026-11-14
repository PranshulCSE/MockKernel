import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router'
import Editor, { type Monaco } from '@monaco-editor/react'
import {
  Trophy,
  Play,
  Send,
  RotateCcw,
  AlertTriangle,
  Terminal,
  LogOut,
  Copy,
  Check,
} from 'lucide-react'
import {
  Badge,
  VerdictBadge,
  Button,
  ResizablePanels,
  GlassCard,
  Timer,
} from '../components/ui'
import {
  getContestById,
  leaveContest as apiLeaveContest,
  type ContestDetail,
  type ContestProblemRef,
} from '../api/contests'
import {
  getProblemById,
  runCode,
  submitCode,
  type ProblemDetail,
} from '../api/problems'
import { useSocket } from '../hooks/useSocket'
import type { Verdict } from '../types/verdict'
import type { VerdictUpdatePayload, TestCaseResult } from '../types/socket'
import { cn } from '../lib/cn'

const LANGUAGES = [
  { id: 'python', name: 'Python 3', monaco: 'python' },
  { id: 'cpp', name: 'C++ 17', monaco: 'cpp' },
  { id: 'java', name: 'Java 17', monaco: 'java' },
  { id: 'javascript', name: 'JavaScript', monaco: 'javascript' },
]

const DEFAULT_STARTER_CODES: Record<string, string> = {
  python: `def solution():\n    # Contest solution here\n    pass\n`,
  cpp: `#include <iostream>\nusing namespace std;\n\nint main() {\n    // Contest solution here\n    return 0;\n}\n`,
  java: `public class Solution {\n    public static void main(String[] args) {\n        // Contest solution here\n    }\n}\n`,
  javascript: `function solution() {\n    // Contest solution here\n}\n`,
}

export default function ContestArenaPage() {
  const { id: contestId } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { joinContest, leaveContest, trackSubmission } = useSocket()

  // Contest State
  const [contest, setContest] = useState<ContestDetail | null>(null)
  const [loadingContest, setLoadingContest] = useState(true)
  const [activeProblemIndex, setActiveProblemIndex] = useState(0)

  // Problem State
  const [currentProblem, setCurrentProblem] = useState<ProblemDetail | null>(null)
  const [loadingProblem, setLoadingProblem] = useState(false)
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null)

  // Solved state tracking per problem: problemId -> 'SOLVED' | 'ATTEMPTED' | 'UNTOUCHED'
  const [solvedStatus, setSolvedStatus] = useState<Record<string, 'SOLVED' | 'ATTEMPTED' | 'UNTOUCHED'>>({})
  const [hasMadeAnySubmission, setHasMadeAnySubmission] = useState(false)

  // Leave Modal State
  const [showLeaveModal, setShowLeaveModal] = useState(false)
  const [leaveLoading, setLeaveLoading] = useState(false)
  const [leaveError, setLeaveError] = useState<string | null>(null)

  // Editor State
  const [language, setLanguage] = useState<string>('python')
  const [code, setCode] = useState<string>('')
  const [isDirty, setIsDirty] = useState<boolean>(false)

  // Console State
  const [consoleTab, setConsoleTab] = useState<'testcases' | 'output'>('testcases')
  const [selectedTestCaseIndex, setSelectedTestCaseIndex] = useState(0)

  // Execution State
  const [executionState, setExecutionState] = useState<{
    status: Verdict | 'IDLE'
    runtime?: number
    memory?: number
    compileOutput?: string
    stderr?: string
    stdout?: string
    testCaseResults?: TestCaseResult[]
    isOptimistic?: boolean
  }>({
    status: 'IDLE',
  })

  // E4 Cooldown state
  const [cooldownSeconds, setCooldownSeconds] = useState(0)
  const [rateLimitMessage, setRateLimitMessage] = useState<string | null>(null)

  // Join contest socket room
  useEffect(() => {
    if (contestId) {
      joinContest(contestId)
      return () => {
        leaveContest(contestId)
      }
    }
  }, [contestId, joinContest, leaveContest])

  // Fetch Contest Details
  useEffect(() => {
    if (!contestId) return

    let cancelled = false

    const loadContest = async () => {
      setLoadingContest(true)
      try {
        const data = await getContestById(contestId)
        if (!cancelled) setContest(data)
      } catch {
        if (cancelled) return
        // Mock fallback if contest not yet in DB
        const now = Date.now()
        setContest({
          id: contestId,
          title: 'MockKernel Live Contest',
          description: 'Official algorithmic round with strict rating updates.',
          status: 'live',
          startTime: new Date(now - 1000 * 60 * 15).toISOString(),
          endTime: new Date(now + 1000 * 60 * 75).toISOString(),
          problemCount: 3,
          participantCount: 88,
          problems: [
            {
              problem: { id: 'two-sum', title: 'Two Sum', difficulty: 'Easy' },
              points: 100,
              order: 0,
            },
            {
              problem: { id: 'valid-parentheses', title: 'Valid Parentheses', difficulty: 'Easy' },
              points: 200,
              order: 1,
            },
            {
              problem: { id: 'lru-cache', title: 'LRU Cache', difficulty: 'Medium' },
              points: 300,
              order: 2,
            },
          ],
        })
      } finally {
        if (!cancelled) setLoadingContest(false)
      }
    }

    void loadContest()

    return () => {
      cancelled = true
    }
  }, [contestId])

  // Load active problem details
  const activeProblemRef: ContestProblemRef | undefined = contest?.problems?.[activeProblemIndex]

  useEffect(() => {
    if (!activeProblemRef?.problem?.id) return
    const pid = activeProblemRef.problem.id

    let cancelled = false

    const loadProblem = async () => {
      setLoadingProblem(true)
      try {
        const p = await getProblemById(pid)
        if (!cancelled) setCurrentProblem(p)
      } catch {
        if (cancelled) return
        // Fallback problem data
        setCurrentProblem({
          id: pid,
          title: activeProblemRef.problem.title,
          difficulty: activeProblemRef.problem.difficulty,
          supportedLanguages: ['python', 'cpp', 'java', 'javascript'],
          statement: `Solve the problem "${activeProblemRef.problem.title}" within the contest constraints.

Input and Output formats follow standard competitive programming conventions.`,
          constraints: '1 <= N <= 10^5\nTime limit: 2.0s\nMemory limit: 256MB',
          sampleTestCases: [
            {
              id: 'tc-1',
              input: '4\n1 2 3 4',
              expectedOutput: '10',
              isSample: true,
              order: 1,
            },
          ],
          createdAt: new Date().toISOString(),
        })
      } finally {
        if (!cancelled) setLoadingProblem(false)
      }
    }

    void loadProblem()

    return () => {
      cancelled = true
    }
  }, [activeProblemRef?.problem?.id, activeProblemRef?.problem?.title, activeProblemRef?.problem?.difficulty])

  // Draft loading per problem in contest
  useEffect(() => {
    if (!activeProblemRef?.problem?.id || !contestId) return
    const pid = activeProblemRef.problem.id
    const draftKey = `mk_contest_${contestId}_${pid}_${language}`
    const saved = localStorage.getItem(draftKey)

    const defaultCode =
      currentProblem?.starterCode?.[language] ||
      DEFAULT_STARTER_CODES[language] ||
      '// Contest solution\n'

    const applyDraft = () => {
      if (saved !== null) {
        setCode(saved)
        setIsDirty(saved !== defaultCode)
      } else {
        setCode(defaultCode)
        setIsDirty(false)
      }
    }

    applyDraft()
  }, [contestId, activeProblemRef?.problem?.id, language, currentProblem])

  const handleCodeChange = (newVal: string | undefined) => {
    const text = newVal ?? ''
    setCode(text)
    if (!activeProblemRef?.problem?.id || !contestId) return
    const pid = activeProblemRef.problem.id
    const draftKey = `mk_contest_${contestId}_${pid}_${language}`
    localStorage.setItem(draftKey, text)
    setIsDirty(true)
  }

  // Rate limit cooldown (E4)
  useEffect(() => {
    if (cooldownSeconds <= 0) return
    const timer = setInterval(() => setCooldownSeconds((s) => s - 1), 1000)
    return () => clearInterval(timer)
  }, [cooldownSeconds])

  // Run / Submit handler scoped to contestId
  const handleExecute = async (mode: 'run' | 'submit') => {
    if (!activeProblemRef?.problem?.id || !contestId || cooldownSeconds > 0) return
    const pid = activeProblemRef.problem.id

    setConsoleTab('output')
    setExecutionState({
      status: 'PENDING',
      isOptimistic: true,
    })

    if (mode === 'submit') {
      setHasMadeAnySubmission(true)
    }

    try {
      const payload = {
        problemId: pid,
        language,
        sourceCode: code,
        contestId,
      }

      const res = mode === 'run' ? await runCode(payload) : await submitCode(payload)
      const subId = res?.id || res?.submissionId

      if (subId) {
        trackSubmission(subId, (update: VerdictUpdatePayload) => {
          setExecutionState({
            status: update.verdict,
            runtime: update.runtime,
            memory: update.memory,
            compileOutput: update.compileOutput,
            testCaseResults: update.testCaseResults,
            isOptimistic: false,
          })

          if (mode === 'submit') {
            if (update.verdict === 'ACCEPTED') {
              setSolvedStatus((prev) => ({ ...prev, [pid]: 'SOLVED' }))
            } else if (update.verdict !== 'PENDING' && update.verdict !== 'RUNNING') {
              setSolvedStatus((prev) => ({
                ...prev,
                [pid]: prev[pid] === 'SOLVED' ? 'SOLVED' : 'ATTEMPTED',
              }))
            }
          }
        })
      }
    } catch (err: unknown) {
      if ((err as { status?: number } | null)?.status === 429) {
        setCooldownSeconds(10)
        setRateLimitMessage('Too many submissions! 10s cooldown.')
        setExecutionState({ status: 'IDLE' })
      } else {
        setExecutionState({
          status: 'INTERNAL_ERROR',
          compileOutput: err instanceof Error ? err.message : 'Execution failed',
        })
      }
    }
  }

  // Leave Contest Handler
  const handleLeaveContest = async () => {
    if (!contestId) return
    setLeaveLoading(true)
    setLeaveError(null)

    try {
      await apiLeaveContest(contestId)
      navigate('/contests')
    } catch (err: unknown) {
      setLeaveError(
        err instanceof Error
          ? err.message
          : 'Cannot leave contest after solutions have already been submitted.'
      )
    } finally {
      setLeaveLoading(false)
    }
  }

  const handleEditorWillMount = (monaco: Monaco) => {
    monaco.editor.defineTheme('mockkernel-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'comment', foreground: '6272a4', fontStyle: 'italic' },
        { token: 'keyword', foreground: '06B6D4' },
        { token: 'string', foreground: '34D399' },
        { token: 'number', foreground: 'F472B6' },
      ],
      colors: {
        'editor.background': '#161B22',
        'editor.foreground': '#F5F5FF',
        'editorLineNumber.foreground': '#9CA3C755',
        'editorLineNumber.activeForeground': '#06B6D4',
        'editor.lineHighlightBackground': '#ffffff08',
      },
    })
  }

  const copyToClipboard = (text: string, index: number) => {
    navigator.clipboard.writeText(text)
    setCopiedIndex(index)
    setTimeout(() => setCopiedIndex(null), 2000)
  }

  if (loadingContest) {
    return (
      <div className="flex h-[80vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-muted">
          <Terminal className="size-8 animate-pulse text-cyan" />
          <p className="font-mono text-sm">Connecting to Live Contest Arena...</p>
        </div>
      </div>
    )
  }

  if (!contest) {
    return (
      <GlassCard className="m-8 flex flex-col items-center gap-4 py-16 text-center">
        <AlertTriangle className="size-10 text-bad" />
        <h2 className="text-xl font-bold">Contest Not Found</h2>
        <Button onClick={() => navigate('/contests')}>Back to Contests</Button>
      </GlassCard>
    )
  }

  // Left panel problem statement
  const leftPanelContent = (
    <div className="flex h-full flex-col overflow-hidden border-r border-white/10 bg-[#07070F]/80">
      <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-4 py-2.5">
        <span className="text-xs font-mono text-cyan uppercase tracking-wider font-semibold">
          Problem {String.fromCharCode(65 + activeProblemIndex)}: {activeProblemRef?.points ?? 100} Points
        </span>
        <Badge
          tone={
            currentProblem?.difficulty === 'Easy'
              ? 'ok'
              : currentProblem?.difficulty === 'Medium'
                ? 'warn'
                : 'bad'
          }
        >
          {currentProblem?.difficulty || 'Medium'}
        </Badge>
      </div>

      <div className="flex-1 overflow-y-auto p-5 text-sm leading-relaxed text-ink/90">
        {loadingProblem ? (
          <div className="flex h-40 items-center justify-center text-muted font-mono text-xs">
            Loading problem...
          </div>
        ) : currentProblem ? (
          <div className="flex flex-col gap-6">
            <h2 className="text-2xl font-bold text-ink">{currentProblem.title}</h2>
            <div className="whitespace-pre-wrap font-sans text-muted/90">
              {currentProblem.statement}
            </div>

            {currentProblem.constraints && (
              <div className="flex flex-col gap-2 rounded-card border border-white/5 bg-white/[0.02] p-4">
                <h3 className="font-semibold text-xs uppercase tracking-wider text-muted">
                  Constraints
                </h3>
                <pre className="font-mono text-xs text-muted/90 whitespace-pre-wrap">
                  {currentProblem.constraints}
                </pre>
              </div>
            )}

            {currentProblem.sampleTestCases && currentProblem.sampleTestCases.length > 0 && (
              <div className="flex flex-col gap-4">
                <h3 className="font-semibold text-xs uppercase tracking-wider text-muted">
                  Sample Test Cases
                </h3>
                {currentProblem.sampleTestCases.map((tc, idx) => (
                  <div
                    key={tc.id || idx}
                    className="flex flex-col gap-2 rounded-card border border-white/10 bg-white/5 p-4"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-cyan font-mono">
                        Sample {idx + 1}
                      </span>
                      <button
                        onClick={() => copyToClipboard(tc.input, idx)}
                        className="flex items-center gap-1 text-xs text-muted hover:text-ink transition-colors"
                      >
                        {copiedIndex === idx ? (
                          <Check className="size-3.5 text-ok" />
                        ) : (
                          <Copy className="size-3.5" />
                        )}
                        <span className="text-[11px]">
                          {copiedIndex === idx ? 'Copied' : 'Copy'}
                        </span>
                      </button>
                    </div>
                    <div className="flex flex-col gap-1 font-mono text-xs">
                      <div>
                        <span className="text-muted/70">Input: </span>
                        <span className="text-ink bg-black/30 px-2 py-0.5 rounded">{tc.input}</span>
                      </div>
                      <div>
                        <span className="text-muted/70">Expected: </span>
                        <span className="text-ink bg-black/30 px-2 py-0.5 rounded">
                          {tc.expectedOutput}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  )

  // Right Panel: Editor Header
  const editorHeader = (
    <div className="flex shrink-0 items-center justify-between border-b border-white/10 bg-[#161B22]/90 px-4 py-2">
      <div className="flex items-center gap-3">
        <select
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
          className="rounded-ctl border border-white/10 bg-white/5 px-3 py-1 text-xs font-mono text-ink focus-visible:border-cyan focus-visible:outline-none"
        >
          {LANGUAGES.map((l) => (
            <option key={l.id} value={l.id} className="bg-[#161B22] text-ink">
              {l.name}
            </option>
          ))}
        </select>
        {isDirty && (
          <span className="text-[11px] font-mono text-warn flex items-center gap-1">
            <span className="size-1.5 rounded-full bg-warn" />
            Draft saved
          </span>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            const defCode =
              currentProblem?.starterCode?.[language] || DEFAULT_STARTER_CODES[language] || ''
            setCode(defCode)
            setIsDirty(false)
          }}
          className="h-8 px-2.5 text-xs text-muted hover:text-ink"
        >
          <RotateCcw className="size-3.5 mr-1" />
          Reset
        </Button>

        {cooldownSeconds > 0 ? (
          <div className="flex items-center gap-2 rounded-ctl border border-warn/40 bg-warn/15 px-3 py-1 font-mono text-xs text-warn">
            <span>Cooldown: {cooldownSeconds}s</span>
          </div>
        ) : (
          <>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => handleExecute('run')}
              disabled={executionState.status === 'PENDING' || executionState.status === 'RUNNING'}
              className="h-8 border-white/15 bg-white/5 text-xs text-ink hover:bg-white/10"
            >
              <Play className="size-3 mr-1 text-cyan fill-cyan" />
              Run
            </Button>
            <Button
              size="sm"
              onClick={() => handleExecute('submit')}
              disabled={executionState.status === 'PENDING' || executionState.status === 'RUNNING'}
              className="h-8 bg-brand text-xs font-semibold shadow-glow"
            >
              <Send className="size-3 mr-1" />
              Submit Solution
            </Button>
          </>
        )}
      </div>
    </div>
  )

  // Console output pane
  const bottomConsole = (
    <div className="flex h-full flex-col overflow-hidden bg-[#0A0D14]">
      <div className="flex shrink-0 items-center justify-between border-y border-white/10 bg-[#10141D] px-4 py-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setConsoleTab('testcases')}
            className={cn(
              'rounded-md px-3 py-1 text-xs font-medium transition-colors',
              consoleTab === 'testcases' ? 'bg-white/10 text-cyan' : 'text-muted hover:text-ink'
            )}
          >
            Sample Tests
          </button>
          <button
            onClick={() => setConsoleTab('output')}
            className={cn(
              'rounded-md px-3 py-1 text-xs font-medium transition-colors',
              consoleTab === 'output' ? 'bg-white/10 text-cyan' : 'text-muted hover:text-ink'
            )}
          >
            Execution Verdict
          </button>
        </div>
        {cooldownSeconds > 0 && rateLimitMessage && (
          <span className="text-[11px] font-mono text-warn">{rateLimitMessage}</span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 text-xs font-mono">
        {consoleTab === 'testcases' ? (
          currentProblem?.sampleTestCases && currentProblem.sampleTestCases.length > 0 ? (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                {currentProblem.sampleTestCases.map((tc, idx) => (
                  <button
                    key={tc.id || idx}
                    onClick={() => setSelectedTestCaseIndex(idx)}
                    className={cn(
                      'rounded-ctl border px-3 py-1 text-xs transition-colors',
                      selectedTestCaseIndex === idx
                        ? 'border-cyan bg-cyan/15 text-cyan'
                        : 'border-white/10 bg-white/5 text-muted hover:text-ink'
                    )}
                  >
                    Sample {idx + 1}
                  </button>
                ))}
              </div>
              <div className="flex flex-col gap-2">
                <span className="text-[11px] text-muted">Input:</span>
                <pre className="rounded border border-white/5 bg-black/40 p-2 text-ink">
                  {currentProblem.sampleTestCases[selectedTestCaseIndex]?.input || ''}
                </pre>
                <span className="text-[11px] text-muted">Expected:</span>
                <pre className="rounded border border-white/5 bg-black/40 p-2 text-ok">
                  {currentProblem.sampleTestCases[selectedTestCaseIndex]?.expectedOutput || ''}
                </pre>
              </div>
            </div>
          ) : (
            <div className="text-muted">No test cases available.</div>
          )
        ) : (
          <div className="flex flex-col gap-3">
            {executionState.status === 'IDLE' ? (
              <div className="flex h-20 items-center justify-center text-muted">
                Run or Submit to view verdict and test metrics.
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between border-b border-white/10 pb-2">
                  <VerdictBadge verdict={executionState.status} />
                  {executionState.runtime !== undefined && (
                    <span className="text-muted">{executionState.runtime}ms</span>
                  )}
                </div>

                {executionState.status === 'TLE' && (
                  <div className="rounded border border-warn/40 bg-warn/15 p-2.5 text-warn">
                    Your code exceeded the 10-second limit — check for infinite loops or inefficient logic.
                  </div>
                )}

                {executionState.compileOutput && (
                  <pre className="rounded border border-bad/30 bg-bad/10 p-2 text-bad whitespace-pre-wrap">
                    {executionState.compileOutput}
                  </pre>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )

  const rightPanelContent = (
    <div className="flex h-full flex-col overflow-hidden bg-[#161B22]">
      {editorHeader}
      <div className="flex-1 overflow-hidden">
        <ResizablePanels
          direction="vertical"
          initialSplit={65}
          first={
            <div className="h-full w-full">
              <Editor
                height="100%"
                language={LANGUAGES.find((l) => l.id === language)?.monaco || 'python'}
                value={code}
                onChange={handleCodeChange}
                beforeMount={handleEditorWillMount}
                theme="mockkernel-dark"
                options={{
                  fontSize: 14,
                  fontFamily: '"JetBrains Mono Variable", monospace',
                  minimap: { enabled: false },
                  automaticLayout: true,
                }}
              />
            </div>
          }
          second={bottomConsole}
        />
      </div>
    </div>
  )

  return (
    <div className="fixed inset-0 top-0 flex flex-col bg-base z-30">
      {/* Contest HUD Top Bar */}
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-white/10 bg-base/90 backdrop-blur-xl px-6">
        {/* Left: Back / Title */}
        <div className="flex items-center gap-4">
          <button
            onClick={() => setShowLeaveModal(true)}
            className="flex items-center gap-1.5 text-xs text-muted hover:text-bad transition-colors"
            title="Leave contest"
          >
            <LogOut className="size-4" />
            <span className="hidden sm:inline">Leave Contest</span>
          </button>
          <div className="h-4 w-px bg-white/10" />
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-ink truncate max-w-xs sm:max-w-md">
              {contest.title}
            </span>
          </div>
        </div>

        {/* Center: Problem Navigation Tabs (Problem A, B, C) */}
        <div className="flex items-center gap-1.5" role="tablist">
          {contest.problems?.map((pRef, idx) => {
            const letter = String.fromCharCode(65 + idx)
            const pid = pRef.problem.id
            const pStatus = solvedStatus[pid] || 'UNTOUCHED'
            const isSelected = activeProblemIndex === idx

            return (
              <button
                key={pid || idx}
                role="tab"
                aria-selected={isSelected}
                onClick={() => setActiveProblemIndex(idx)}
                className={cn(
                  'flex items-center gap-2 rounded-full px-3.5 py-1 text-xs font-mono transition-all',
                  isSelected
                    ? 'bg-cyan/20 text-cyan border border-cyan/40 shadow-glow-cyan'
                    : 'bg-white/5 text-muted hover:bg-white/10 hover:text-ink border border-white/5'
                )}
              >
                {/* Solved Status Dot */}
                {pStatus === 'SOLVED' ? (
                  <span className="size-2 rounded-full bg-ok shadow-[0_0_8px_#34D399]" />
                ) : pStatus === 'ATTEMPTED' ? (
                  <span className="size-2 rounded-full bg-warn shadow-[0_0_8px_#FBBF24]" />
                ) : (
                  <span className="size-2 rounded-full bg-white/20" />
                )}
                <span>Problem {letter}</span>
              </button>
            )
          })}
        </div>

        {/* Right: Big Countdown Timer & Leaderboard Button */}
        <div className="flex items-center gap-4">
          <Timer targetTime={contest.endTime} size="md" />

          <Link to={`/contests/${contestId}/leaderboard`} target="_blank">
            <Button variant="secondary" size="sm" className="h-9 text-xs">
              <Trophy className="size-3.5 mr-1 text-cyan" />
              Leaderboard
            </Button>
          </Link>
        </div>
      </header>

      {/* Main Resizable Arena Body */}
      <div className="flex-1 overflow-hidden">
        <ResizablePanels
          direction="horizontal"
          initialSplit={40}
          minSplit={25}
          maxSplit={60}
          first={leftPanelContent}
          second={rightPanelContent}
        />
      </div>

      {/* Leave Contest Confirmation Modal */}
      {showLeaveModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
        >
          <GlassCard strong className="w-full max-w-md flex flex-col gap-5 p-6 border-white/20">
            <div className="flex items-center gap-3 text-warn">
              <AlertTriangle className="size-6 shrink-0" />
              <h3 className="text-lg font-bold text-ink">Leave Contest Confirmation</h3>
            </div>

            <p className="text-sm text-muted leading-relaxed">
              Are you sure you want to leave this contest?
              <br />
              <strong className="text-ink">Note:</strong> Platform rules permit leaving only if
              you haven't submitted any solutions yet.
              {hasMadeAnySubmission && (
                <span className="block mt-2 text-xs text-bad font-medium">
                  ⚠️ You have already made a submission in this contest. Leaving is now locked by server policy.
                </span>
              )}
            </p>

            {leaveError && (
              <div className="rounded border border-bad/30 bg-bad/10 p-3 text-xs font-mono text-bad">
                {leaveError}
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-2">
              <Button
                variant="ghost"
                onClick={() => {
                  setShowLeaveModal(false)
                  setLeaveError(null)
                }}
              >
                Cancel
              </Button>
              <Button
                variant="secondary"
                loading={leaveLoading}
                className="border-bad/40 text-bad hover:bg-bad/10"
                onClick={handleLeaveContest}
              >
                Confirm Leave
              </Button>
            </div>
          </GlassCard>
        </div>
      )}
    </div>
  )
}
