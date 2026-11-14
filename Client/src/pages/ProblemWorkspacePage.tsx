import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router'
import Editor, { type Monaco } from '@monaco-editor/react'
import {
  Play,
  Send,
  RotateCcw,
  Copy,
  Check,
  AlertTriangle,
  ChevronLeft,
  Terminal,
  FileCode,
  History,
  AlertCircle,
} from 'lucide-react'
import {
  Badge,
  VerdictBadge,
  Button,
  ResizablePanels,
  GlassCard,
} from '../components/ui'
import {
  getProblemById,
  runCode,
  submitCode,
  getSubmissions,
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
  python: `def solution():
    # Write your solution here
    pass
`,
  cpp: `#include <iostream>
#include <vector>

using namespace std;

int main() {
    // Write your solution here
    return 0;
}
`,
  java: `public class Solution {
    public static void main(String[] args) {
        // Write your solution here
    }
}
`,
  javascript: `function solution() {
    // Write your solution here
}
`,
}

interface SubmissionItem {
  id: string
  verdict: Verdict
  language: string
  runtime?: number
  memory?: number
  createdAt: string
}

export default function ProblemWorkspacePage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { trackSubmission } = useSocket()

  // Problem State
  const [problem, setProblem] = useState<ProblemDetail | null>(null)
  const [loadingProblem, setLoadingProblem] = useState(true)
  const [leftTab, setLeftTab] = useState<'statement' | 'history'>('statement')
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null)

  // Submissions history
  const [history, setHistory] = useState<SubmissionItem[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)

  // Editor State
  const [language, setLanguage] = useState<string>('python')
  const [code, setCode] = useState<string>('')
  const [isDirty, setIsDirty] = useState<boolean>(false)
  const [showLeaveModal, setShowLeaveModal] = useState(false)
  const [pendingNavigation, setPendingNavigation] = useState<string | null>(null)

  // Console / Output State
  const [consoleTab, setConsoleTab] = useState<'testcases' | 'output'>('testcases')
  const [selectedTestCaseIndex, setSelectedTestCaseIndex] = useState(0)
  const [customInput, setCustomInput] = useState('')
  const [useCustomInput, setUseCustomInput] = useState(false)

  // Execution State
  const [executionState, setExecutionState] = useState<{
    status: Verdict | 'IDLE'
    runtime?: number
    memory?: number
    stdout?: string
    stderr?: string
    compileOutput?: string
    testCaseResults?: TestCaseResult[]
    isOptimistic?: boolean
  }>({
    status: 'IDLE',
  })

  // Edge Case E4: 429 Cooldown
  const [cooldownSeconds, setCooldownSeconds] = useState(0)
  const [rateLimitMessage, setRateLimitMessage] = useState<string | null>(null)

  // 1. Fetch Problem Details
  useEffect(() => {
    if (!id) return
    setLoadingProblem(true)

    getProblemById(id)
      .then((data) => {
        setProblem(data)
      })
      .catch(() => {
        // Fallback mock problem for local development
        setProblem({
          id,
          title: 'Two Sum',
          difficulty: 'Easy',
          supportedLanguages: ['python', 'cpp', 'java', 'javascript'],
          statement: `Given an array of integers \`nums\` and an integer \`target\`, return indices of the two numbers such that they add up to \`target\`.

You may assume that each input would have **exactly one solution**, and you may not use the same element twice.

You can return the answer in any order.`,
          constraints: `• 2 <= nums.length <= 10^4
• -10^9 <= nums[i] <= 10^9
• -10^9 <= target <= 10^9
• Only one valid answer exists.`,
          sampleTestCases: [
            {
              id: 'sample-1',
              input: 'nums = [2,7,11,15], target = 9',
              expectedOutput: '[0,1]',
              isSample: true,
              order: 1,
              explanation: 'Because nums[0] + nums[1] == 9, we return [0, 1].',
            },
            {
              id: 'sample-2',
              input: 'nums = [3,2,4], target = 6',
              expectedOutput: '[1,2]',
              isSample: true,
              order: 2,
            },
          ],
          createdAt: new Date().toISOString(),
        })
      })
      .finally(() => {
        setLoadingProblem(false)
      })
  }, [id])

  // 2. Draft Persistence & Starter Code Loading
  useEffect(() => {
    if (!id) return
    const draftKey = `mk_draft_${id}_${language}`
    const savedDraft = localStorage.getItem(draftKey)

    const defaultCode =
      problem?.starterCode?.[language] ||
      DEFAULT_STARTER_CODES[language] ||
      '// Write solution here\n'

    if (savedDraft !== null) {
      setCode(savedDraft)
      setIsDirty(savedDraft !== defaultCode)
    } else {
      setCode(defaultCode)
      setIsDirty(false)
    }
  }, [id, language, problem])

  // Save draft on code edit
  const handleCodeChange = (newVal: string | undefined) => {
    const text = newVal ?? ''
    setCode(text)
    if (!id) return

    const draftKey = `mk_draft_${id}_${language}`
    localStorage.setItem(draftKey, text)

    const defaultCode =
      problem?.starterCode?.[language] || DEFAULT_STARTER_CODES[language] || ''
    setIsDirty(text !== defaultCode)
  }

  // Warning before unload
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [isDirty])

  // Reset to starter code
  const handleResetStarter = () => {
    const defaultCode =
      problem?.starterCode?.[language] || DEFAULT_STARTER_CODES[language] || ''
    setCode(defaultCode)
    if (id) {
      localStorage.removeItem(`mk_draft_${id}_${language}`)
    }
    setIsDirty(false)
  }

  // Load submissions history
  const loadHistory = () => {
    if (!id) return
    setLoadingHistory(true)
    getSubmissions(id)
      .then((data) => {
        setHistory(
          data.map((s: any) => ({
            id: s.id || s._id,
            verdict: s.verdict,
            language: s.language,
            runtime: s.runtime,
            memory: s.memory,
            createdAt: s.createdAt,
          }))
        )
      })
      .catch(() => {})
      .finally(() => setLoadingHistory(false))
  }

  useEffect(() => {
    if (leftTab === 'history') {
      loadHistory()
    }
  }, [leftTab])

  // Rate limit cooldown interval (E4)
  useEffect(() => {
    if (cooldownSeconds <= 0) {
      setRateLimitMessage(null)
      return
    }
    const timer = setInterval(() => {
      setCooldownSeconds((s) => s - 1)
    }, 1000)
    return () => clearInterval(timer)
  }, [cooldownSeconds])

  // Handle Run or Submit execution
  const handleExecute = async (mode: 'run' | 'submit') => {
    if (!id || cooldownSeconds > 0) return

    setConsoleTab('output')

    // Optimistic pending within 100ms
    setExecutionState({
      status: 'PENDING',
      isOptimistic: true,
    })

    try {
      const payload = {
        problemId: id,
        language,
        sourceCode: code,
      }

      const submission = mode === 'run' ? await runCode(payload) : await submitCode(payload)
      const submissionId = submission?.id || submission?.submissionId

      if (submissionId) {
        trackSubmission(submissionId, (update: VerdictUpdatePayload) => {
          setExecutionState({
            status: update.verdict,
            runtime: update.runtime,
            memory: update.memory,
            compileOutput: update.compileOutput,
            testCaseResults: update.testCaseResults,
            isOptimistic: false,
          })
        })
      }
    } catch (err: any) {
      if (err?.status === 429) {
        // Edge Case E4: 429 Rate Limit
        setCooldownSeconds(10)
        setRateLimitMessage('Too many submissions! Please wait 10 seconds cooldown.')
        setExecutionState({ status: 'IDLE' })
      } else {
        setExecutionState({
          status: 'INTERNAL_ERROR',
          compileOutput: err?.message || 'Execution request failed',
        })
      }
    }
  }

  // Monaco Theme Setup
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
  }

  const copyToClipboard = (text: string, index: number) => {
    navigator.clipboard.writeText(text)
    setCopiedIndex(index)
    setTimeout(() => setCopiedIndex(null), 2000)
  }

  const handleSafeNavigation = (to: string) => {
    if (isDirty) {
      setPendingNavigation(to)
      setShowLeaveModal(true)
    } else {
      navigate(to)
    }
  }

  if (loadingProblem) {
    return (
      <div className="flex h-[80vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-muted">
          <Terminal className="size-8 animate-pulse text-cyan" />
          <p className="font-mono text-sm">Preparing problem workspace...</p>
        </div>
      </div>
    )
  }

  if (!problem) {
    return (
      <GlassCard className="m-8 flex flex-col items-center gap-4 py-16 text-center">
        <AlertCircle className="size-10 text-bad" />
        <h2 className="text-xl font-bold">Problem Not Found</h2>
        <Button onClick={() => navigate('/practice')}>Back to Practice</Button>
      </GlassCard>
    )
  }

  // Left panel view: Statement & History tabs
  const leftPanelContent = (
    <div className="flex h-full flex-col overflow-hidden border-r border-white/10 bg-[#07070F]/80">
      {/* Top Header / Tabs */}
      <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-4 py-2.5">
        <button
          onClick={() => handleSafeNavigation('/practice')}
          className="flex items-center gap-1.5 text-xs text-muted hover:text-ink transition-colors focus-visible:outline-none"
        >
          <ChevronLeft className="size-4" />
          Catalog
        </button>

        <div className="flex rounded-lg bg-white/5 p-1">
          <button
            onClick={() => setLeftTab('statement')}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-colors',
              leftTab === 'statement'
                ? 'bg-cyan/20 text-cyan shadow-sm'
                : 'text-muted hover:text-ink'
            )}
          >
            <FileCode className="size-3.5" />
            Description
          </button>
          <button
            onClick={() => setLeftTab('history')}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-colors',
              leftTab === 'history'
                ? 'bg-cyan/20 text-cyan shadow-sm'
                : 'text-muted hover:text-ink'
            )}
          >
            <History className="size-3.5" />
            Submissions
          </button>
        </div>
      </div>

      {/* Panel Body */}
      <div className="flex-1 overflow-y-auto p-5 text-sm leading-relaxed text-ink/90">
        {leftTab === 'statement' ? (
          <div className="flex flex-col gap-6">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold text-ink">{problem.title}</h1>
                <Badge
                  tone={
                    problem.difficulty === 'Easy'
                      ? 'ok'
                      : problem.difficulty === 'Medium'
                        ? 'warn'
                        : 'bad'
                  }
                >
                  {problem.difficulty}
                </Badge>
              </div>
              {problem.topic && (
                <span className="mt-1 inline-block text-xs font-mono text-muted">
                  Topic: {problem.topic}
                </span>
              )}
            </div>

            {/* Problem Statement */}
            <div className="whitespace-pre-wrap font-sans text-muted/90">
              {problem.statement}
            </div>

            {/* Constraints */}
            {problem.constraints && (
              <div className="flex flex-col gap-2 rounded-card border border-white/5 bg-white/[0.02] p-4">
                <h3 className="font-semibold text-ink text-xs uppercase tracking-wider text-muted">
                  Constraints
                </h3>
                <pre className="font-mono text-xs text-muted/90 whitespace-pre-wrap leading-relaxed">
                  {problem.constraints}
                </pre>
              </div>
            )}

            {/* Sample Testcases */}
            {problem.sampleTestCases && problem.sampleTestCases.length > 0 && (
              <div className="flex flex-col gap-4">
                <h3 className="font-semibold text-ink text-xs uppercase tracking-wider text-muted">
                  Sample Test Cases
                </h3>
                {problem.sampleTestCases.map((tc, idx) => (
                  <div
                    key={tc.id || idx}
                    className="flex flex-col gap-2 rounded-card border border-white/10 bg-white/5 p-4"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-cyan font-mono">
                        Example {idx + 1}
                      </span>
                      <button
                        onClick={() => copyToClipboard(tc.input, idx)}
                        className="flex items-center gap-1 text-xs text-muted hover:text-ink transition-colors"
                        aria-label="Copy input"
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

                    <div className="flex flex-col gap-1.5 font-mono text-xs">
                      <div>
                        <span className="text-muted/70">Input: </span>
                        <span className="text-ink bg-black/30 px-2 py-0.5 rounded">
                          {tc.input}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted/70">Expected: </span>
                        <span className="text-ink bg-black/30 px-2 py-0.5 rounded">
                          {tc.expectedOutput}
                        </span>
                      </div>
                      {tc.explanation && (
                        <div className="mt-1 text-muted text-[11px] font-sans">
                          <span className="font-semibold text-ink/80">Explanation: </span>
                          {tc.explanation}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          /* Submissions History */
          <div className="flex flex-col gap-4">
            <h2 className="text-lg font-bold">Submission History</h2>
            {loadingHistory ? (
              <div className="flex h-32 items-center justify-center text-muted font-mono text-xs">
                Loading history...
              </div>
            ) : history.length === 0 ? (
              <div className="rounded-card border border-white/5 bg-white/[0.02] p-8 text-center text-muted text-xs">
                No submissions for this problem yet. Run or submit your code to see results here!
              </div>
            ) : (
              <ul className="flex flex-col gap-2.5">
                {history.map((sub) => (
                  <li
                    key={sub.id}
                    className="flex items-center justify-between rounded-ctl border border-white/10 bg-white/5 px-4 py-3 text-xs"
                  >
                    <div className="flex items-center gap-3">
                      <VerdictBadge verdict={sub.verdict} />
                      <span className="font-mono text-muted uppercase">{sub.language}</span>
                    </div>
                    <div className="flex items-center gap-4 text-muted font-mono">
                      {sub.runtime !== undefined && <span>{sub.runtime}ms</span>}
                      {sub.memory !== undefined && <span>{Math.round(sub.memory / 1024)}KB</span>}
                      <span className="text-[10px] text-muted/60">
                        {new Date(sub.createdAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  )

  // Right panel upper: Monaco Code Editor
  const editorHeader = (
    <div className="flex shrink-0 items-center justify-between border-b border-white/10 bg-[#161B22]/90 px-4 py-2">
      <div className="flex items-center gap-3">
        <select
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
          className="rounded-ctl border border-white/10 bg-white/5 px-3 py-1 text-xs font-mono text-ink focus-visible:outline-none focus-visible:border-cyan"
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
            Unsaved draft
          </span>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleResetStarter}
          className="text-xs text-muted hover:text-ink h-8 px-2.5"
          title="Reset to starter code"
        >
          <RotateCcw className="size-3.5 mr-1" />
          Reset
        </Button>

        {/* E4 Cooldown indicator or Run/Submit buttons */}
        {cooldownSeconds > 0 ? (
          <div className="flex items-center gap-2 rounded-ctl border border-warn/40 bg-warn/15 px-3 py-1 font-mono text-xs text-warn">
            {/* Visual cooldown ring */}
            <div className="relative size-4">
              <svg className="size-4 -rotate-90">
                <circle
                  cx="8"
                  cy="8"
                  r="6"
                  stroke="currentColor"
                  strokeWidth="2"
                  fill="transparent"
                  className="opacity-25"
                />
                <circle
                  cx="8"
                  cy="8"
                  r="6"
                  stroke="currentColor"
                  strokeWidth="2"
                  fill="transparent"
                  strokeDasharray="37.7"
                  strokeDashoffset={`${37.7 * (1 - cooldownSeconds / 10)}`}
                  className="transition-all duration-1000"
                />
              </svg>
            </div>
            <span>Cooldown: {cooldownSeconds}s</span>
          </div>
        ) : (
          <>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => handleExecute('run')}
              disabled={executionState.status === 'PENDING' || executionState.status === 'RUNNING'}
              className="h-8 border-white/15 bg-white/5 text-xs text-ink hover:bg-white/10 hover:text-cyan"
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
              Submit
            </Button>
          </>
        )}
      </div>
    </div>
  )

  // Bottom Console Tabs & Execution View
  const bottomConsoleContent = (
    <div className="flex h-full flex-col overflow-hidden bg-[#0A0D14]">
      {/* Console Tab switcher */}
      <div className="flex shrink-0 items-center justify-between border-y border-white/10 bg-[#10141D] px-4 py-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setConsoleTab('testcases')}
            className={cn(
              'rounded-md px-3 py-1 text-xs font-medium transition-colors',
              consoleTab === 'testcases'
                ? 'bg-white/10 text-cyan'
                : 'text-muted hover:text-ink'
            )}
          >
            Test Cases
          </button>
          <button
            onClick={() => setConsoleTab('output')}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-colors',
              consoleTab === 'output'
                ? 'bg-white/10 text-cyan'
                : 'text-muted hover:text-ink'
            )}
          >
            <span>Execution Output</span>
            {executionState.status !== 'IDLE' && (
              <span className="size-1.5 rounded-full bg-cyan animate-pulse" />
            )}
          </button>
        </div>

        {/* E4 Rate limit warning message banner */}
        {rateLimitMessage && (
          <span className="text-[11px] font-mono text-warn">{rateLimitMessage}</span>
        )}
      </div>

      {/* Console Content */}
      <div className="flex-1 overflow-y-auto p-4 text-xs font-mono">
        {consoleTab === 'testcases' ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              {problem.sampleTestCases?.map((tc, idx) => (
                <button
                  key={tc.id || idx}
                  onClick={() => {
                    setSelectedTestCaseIndex(idx)
                    setUseCustomInput(false)
                  }}
                  className={cn(
                    'rounded-ctl border px-3 py-1 text-xs transition-colors',
                    !useCustomInput && selectedTestCaseIndex === idx
                      ? 'border-cyan bg-cyan/15 text-cyan'
                      : 'border-white/10 bg-white/5 text-muted hover:text-ink'
                  )}
                >
                  Case {idx + 1}
                </button>
              ))}
              <button
                onClick={() => setUseCustomInput(true)}
                className={cn(
                  'rounded-ctl border px-3 py-1 text-xs transition-colors',
                  useCustomInput
                    ? 'border-cyan bg-cyan/15 text-cyan'
                    : 'border-white/10 bg-white/5 text-muted hover:text-ink'
                )}
              >
                Custom Input
              </button>
            </div>

            {useCustomInput ? (
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] text-muted">Provide standard input:</label>
                <textarea
                  value={customInput}
                  onChange={(e) => setCustomInput(e.target.value)}
                  placeholder="Paste custom input here..."
                  className="h-20 w-full rounded-ctl border border-white/10 bg-black/40 p-2.5 font-mono text-xs text-ink focus-visible:border-cyan focus-visible:outline-none"
                />
              </div>
            ) : (
              problem.sampleTestCases?.[selectedTestCaseIndex] && (
                <div className="flex flex-col gap-3">
                  <div>
                    <span className="text-[11px] text-muted">Input:</span>
                    <pre className="mt-1 rounded border border-white/5 bg-black/40 p-2 text-ink">
                      {problem.sampleTestCases[selectedTestCaseIndex].input}
                    </pre>
                  </div>
                  <div>
                    <span className="text-[11px] text-muted">Expected Output:</span>
                    <pre className="mt-1 rounded border border-white/5 bg-black/40 p-2 text-ok">
                      {problem.sampleTestCases[selectedTestCaseIndex].expectedOutput}
                    </pre>
                  </div>
                </div>
              )
            )}
          </div>
        ) : (
          /* Execution Output Tab */
          <div className="flex flex-col gap-4">
            {executionState.status === 'IDLE' ? (
              <div className="flex h-24 items-center justify-center text-muted">
                Run or Submit your solution to inspect test outputs and runtime metrics.
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {/* Status Bar */}
                <div className="flex items-center justify-between border-b border-white/10 pb-3">
                  <div className="flex items-center gap-3">
                    <VerdictBadge verdict={executionState.status} />
                    {executionState.isOptimistic && (
                      <span className="text-[11px] text-muted animate-pulse">
                        (Sent to execution worker...)
                      </span>
                    )}
                  </div>

                  {executionState.runtime !== undefined && (
                    <div className="flex items-center gap-4 text-muted">
                      <span>Runtime: {executionState.runtime}ms</span>
                      {executionState.memory !== undefined && (
                        <span>Memory: {Math.round(executionState.memory / 1024)}KB</span>
                      )}
                    </div>
                  )}
                </div>

                {/* Edge Case E2: 10s TLE Timeout explanation UI */}
                {executionState.status === 'TLE' && (
                  <div className="flex items-start gap-3 rounded-ctl border border-warn/40 bg-warn/15 p-3 text-warn">
                    <AlertTriangle className="size-5 shrink-0 mt-0.5" />
                    <div>
                      <h4 className="font-semibold text-xs">Time Limit Exceeded</h4>
                      <p className="mt-0.5 text-xs text-ink/90 font-sans">
                        Your code exceeded the 10-second limit — check for infinite loops or inefficient logic.
                      </p>
                    </div>
                  </div>
                )}

                {/* Compilation / Syntax Errors */}
                {executionState.compileOutput && (
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[11px] text-bad font-semibold">Compiler Output:</span>
                    <pre className="max-h-40 overflow-y-auto rounded border border-bad/30 bg-bad/10 p-3 text-xs text-bad leading-relaxed whitespace-pre-wrap">
                      {executionState.compileOutput}
                    </pre>
                  </div>
                )}

                {/* Stderr / Stdout */}
                {executionState.stderr && (
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[11px] text-bad font-semibold">Standard Error (stderr):</span>
                    <pre className="max-h-32 overflow-y-auto rounded border border-bad/20 bg-bad/5 p-2.5 text-xs text-bad whitespace-pre-wrap">
                      {executionState.stderr}
                    </pre>
                  </div>
                )}

                {executionState.stdout && (
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[11px] text-muted font-semibold">Standard Output (stdout):</span>
                    <pre className="max-h-32 overflow-y-auto rounded border border-white/10 bg-black/40 p-2.5 text-xs text-ink whitespace-pre-wrap">
                      {executionState.stdout}
                    </pre>
                  </div>
                )}

                {/* Test case breakdown */}
                {executionState.testCaseResults && executionState.testCaseResults.length > 0 && (
                  <div className="flex flex-col gap-2 mt-2">
                    <span className="text-[11px] text-muted">Test Case Results:</span>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {executionState.testCaseResults.map((tc, idx) => (
                        <div
                          key={idx}
                          className={cn(
                            'flex items-center justify-between rounded-ctl border p-2.5 text-xs',
                            tc.status === 'ACCEPTED'
                              ? 'border-ok/30 bg-ok/10 text-ok'
                              : 'border-bad/30 bg-bad/10 text-bad'
                          )}
                        >
                          <span className="font-semibold">Test {idx + 1}</span>
                          <span className="font-mono">{tc.status}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )

  // Right pane: Monaco Editor stacked over bottom console
  const rightPanelContent = (
    <div className="flex h-full flex-col overflow-hidden bg-[#161B22]">
      {editorHeader}
      <div className="flex-1 overflow-hidden">
        <ResizablePanels
          direction="vertical"
          initialSplit={65}
          minSplit={30}
          maxSplit={85}
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
                  scrollBeyondLastLine: false,
                  automaticLayout: true,
                  lineNumbers: 'on',
                  cursorBlinking: 'smooth',
                  smoothScrolling: true,
                  padding: { top: 12, bottom: 12 },
                }}
              />
            </div>
          }
          second={bottomConsoleContent}
        />
      </div>
    </div>
  )

  return (
    <div className="fixed inset-x-0 bottom-0 top-16 overflow-hidden bg-base">
      <ResizablePanels
        direction="horizontal"
        initialSplit={40}
        minSplit={25}
        maxSplit={60}
        first={leftPanelContent}
        second={rightPanelContent}
      />

      {/* Unsaved Changes Warning Modal */}
      {showLeaveModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
        >
          <GlassCard strong className="w-full max-w-md flex flex-col gap-5 p-6 border-white/20">
            <div className="flex items-center gap-3 text-warn">
              <AlertTriangle className="size-6 shrink-0" />
              <h3 className="text-lg font-bold text-ink">Unsaved Changes</h3>
            </div>
            <p className="text-sm text-muted leading-relaxed">
              You have modified code that differs from the default starter code. Your draft is
              automatically saved in your browser, but are you sure you want to navigate away?
            </p>
            <div className="flex items-center justify-end gap-3 pt-2">
              <Button
                variant="ghost"
                onClick={() => {
                  setShowLeaveModal(false)
                  setPendingNavigation(null)
                }}
              >
                Stay Here
              </Button>
              <Button
                variant="secondary"
                className="border-bad/40 text-bad hover:bg-bad/10"
                onClick={() => {
                  setShowLeaveModal(false)
                  if (pendingNavigation) {
                    navigate(pendingNavigation)
                  }
                }}
              >
                Leave Workspace
              </Button>
            </div>
          </GlassCard>
        </div>
      )}
    </div>
  )
}
