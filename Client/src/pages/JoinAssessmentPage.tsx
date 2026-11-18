import { useState, useRef, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import {
  ShieldCheck,
  Camera,
  Maximize,
  AlertCircle,
  Clock,
  CheckCircle2,
  XCircle,
  Sparkles,
  ArrowRight,
  RefreshCw,
  Lock,
  FileCode,
} from 'lucide-react'
import { assessmentsApi, type AssessmentSummary } from '../api/assessments'
import { Button, GlassCard, Badge } from '../components/ui'
import { useAuthStore } from '../store/authStore'

export default function JoinAssessmentPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const initialCode = searchParams.get('code') || ''

  const user = useAuthStore((s) => s.user)

  const [code, setCode] = useState<string>(initialCode.toUpperCase())
  const [loading, setLoading] = useState<boolean>(false)
  const [error, setError] = useState<string>('')
  const [assessment, setAssessment] = useState<AssessmentSummary | null>(null)

  // Pre-flight check state
  const [cameraStatus, setCameraStatus] = useState<'pending' | 'success' | 'failed'>('pending')
  const [fullscreenSupported, setFullscreenSupported] = useState<boolean>(true)
  const [preflightStream, setPreflightStream] = useState<MediaStream | null>(null)
  const videoPreviewRef = useRef<HTMLVideoElement | null>(null)

  // Rules acknowledged
  const [rulesAgreed, setRulesAgreed] = useState<boolean>(false)

  // Verify browser fullscreen support on mount
  useEffect(() => {
    const docEl = document.documentElement as any
    const supported = Boolean(
      docEl.requestFullscreen || docEl.webkitRequestFullscreen || docEl.msRequestFullscreen
    )
    setFullscreenSupported(supported)
  }, [])

  // Auto-validate if code is in URL search param
  useEffect(() => {
    if (initialCode.trim().length >= 4) {
      void handleValidateCode(initialCode.trim().toUpperCase())
    }
  }, [initialCode])

  // Stop preflight video stream when unmounting
  useEffect(() => {
    return () => {
      if (preflightStream) {
        preflightStream.getTracks().forEach((t) => t.stop())
      }
    }
  }, [preflightStream])

  // Camera check
  const runCameraCheck = async () => {
    try {
      setCameraStatus('pending')
      if (preflightStream) {
        preflightStream.getTracks().forEach((t) => t.stop())
      }

      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
      setPreflightStream(stream)
      if (videoPreviewRef.current) {
        videoPreviewRef.current.srcObject = stream
        void videoPreviewRef.current.play().catch(() => {})
      }
      setCameraStatus('success')
    } catch (err) {
      console.warn('[JoinAssessment] Preflight camera check failed:', err)
      setCameraStatus('failed')
    }
  }

  // Validate assessment code
  const handleValidateCode = async (codeToVerify?: string) => {
    const targetCode = (codeToVerify || code).trim().toUpperCase()
    if (!targetCode) {
      setError('Please enter a valid assessment code.')
      return
    }

    try {
      setLoading(true)
      setError('')
      const data = await assessmentsApi.join(targetCode)
      setAssessment(data)
      // Automatically trigger camera test when assessment is loaded
      void runCameraCheck()
    } catch (err: any) {
      const msg = err?.response?.data?.error?.message || err?.message || 'Assessment not found.'
      setError(msg)
      setAssessment(null)
    } finally {
      setLoading(false)
    }
  }

  // Candidate proceeds into proctored arena
  const handleEnterArena = async () => {
    if (!assessment) return

    // Stop pre-flight preview stream so arena camera can claim the device
    if (preflightStream) {
      preflightStream.getTracks().forEach((t) => t.stop())
      setPreflightStream(null)
    }

    // Try requesting fullscreen immediately on user click
    try {
      const docEl = document.documentElement as any
      if (docEl.requestFullscreen) {
        await docEl.requestFullscreen()
      } else if (docEl.webkitRequestFullscreen) {
        await docEl.webkitRequestFullscreen()
      }
    } catch (err) {
      console.warn('[JoinAssessment] Fullscreen request on enter ignored:', err)
    }

    navigate(`/assessments/${assessment.id}/arena`)
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Title & Banner */}
      <div className="mb-8 text-center space-y-3">
        <div className="inline-flex items-center gap-2 rounded-full border border-cyan/30 bg-cyan/10 px-3.5 py-1 text-xs font-semibold text-cyan shadow-glow-cyan">
          <ShieldCheck className="size-4" />
          <span>AI-Proctored Examination Portal</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-bold font-display text-ink tracking-tight">
          Join Scheduled Assessment
        </h1>
        <p className="text-sm sm:text-base text-muted max-w-2xl mx-auto leading-relaxed">
          Enter your unique assessment access code provided by your administrator or institution to
          run the pre-flight security check and begin your proctored session.
        </p>
      </div>

      {/* Code Input Card */}
      {!assessment && (
        <GlassCard className="mx-auto max-w-lg p-6 sm:p-8">
          <form
            onSubmit={(e) => {
              e.preventDefault()
              void handleValidateCode()
            }}
            className="space-y-4"
          >
            <div>
              <label
                htmlFor="assessment-code"
                className="block text-xs font-semibold uppercase tracking-wider text-muted mb-2"
              >
                Assessment Access Code
              </label>
              <div className="relative">
                <input
                  id="assessment-code"
                  type="text"
                  value={code}
                  onChange={(e) => {
                    setCode(e.target.value.toUpperCase())
                    setError('')
                  }}
                  placeholder="e.g. MOCK-7X9A"
                  maxLength={16}
                  className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-center font-mono text-lg font-bold tracking-widest text-ink uppercase placeholder:text-muted/40 focus:border-cyan focus:outline-none focus:ring-2 focus:ring-cyan/30 transition-all"
                  autoFocus
                />
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted/60 pointer-events-none" />
              </div>
              <p className="mt-2 text-xs text-muted text-center">
                Codes are case-insensitive and formatted like <span className="font-mono text-cyan">MOCK-XXXX</span>.
              </p>
            </div>

            {error && (
              <div className="rounded-xl border border-bad/30 bg-bad/10 p-3 flex items-start gap-2.5 text-xs text-bad">
                <AlertCircle className="size-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <Button
              type="submit"
              variant="primary"
              disabled={loading || code.trim().length < 3}
              className="w-full justify-center py-3 text-sm font-semibold shadow-glow"
            >
              {loading ? (
                <>
                  <RefreshCw className="size-4 animate-spin mr-2" />
                  Verifying Code...
                </>
              ) : (
                <>
                  Verify & Continue
                  <ArrowRight className="size-4 ml-1.5" />
                </>
              )}
            </Button>
          </form>
        </GlassCard>
      )}

      {/* Assessment Loaded: Instructions & Pre-Flight Check */}
      {assessment && (
        <div className="space-y-6">
          {/* Top Assessment Overview Card */}
          <GlassCard className="p-6 sm:p-8">
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/10 pb-5">
              <div>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="font-mono text-xs font-semibold uppercase text-cyan px-2 py-0.5 rounded bg-cyan/10 border border-cyan/20">
                    {assessment.code}
                  </span>
                  <Badge
                    tone={
                      assessment.windowState === 'OPEN'
                        ? 'run'
                        : assessment.windowState === 'UPCOMING'
                        ? 'flag'
                        : 'bad'
                    }
                  >
                    {assessment.windowState === 'OPEN'
                      ? 'Window Open'
                      : assessment.windowState === 'UPCOMING'
                      ? 'Upcoming'
                      : 'Expired'}
                  </Badge>
                </div>
                <h2 className="text-2xl font-bold font-display text-ink">
                  {assessment.title}
                </h2>
                {assessment.description && (
                  <p className="text-sm text-muted mt-1 leading-relaxed">
                    {assessment.description}
                  </p>
                )}
              </div>

              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setAssessment(null)
                  setError('')
                }}
              >
                Change Code
              </Button>
            </div>

            {/* Assessment Details Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-5">
              <div className="rounded-xl border border-white/10 bg-white/5 p-3.5">
                <div className="flex items-center gap-1.5 text-muted text-xs mb-1">
                  <Clock className="size-3.5 text-cyan" />
                  <span>Duration</span>
                </div>
                <div className="text-base font-bold text-ink">
                  {assessment.durationMinutes} Minutes
                </div>
              </div>

              <div className="rounded-xl border border-white/10 bg-white/5 p-3.5">
                <div className="flex items-center gap-1.5 text-muted text-xs mb-1">
                  <FileCode className="size-3.5 text-cyan" />
                  <span>Problems</span>
                </div>
                <div className="text-base font-bold text-ink">
                  {assessment.problemCount} {assessment.problemCount === 1 ? 'Problem' : 'Problems'}
                </div>
              </div>

              <div className="rounded-xl border border-white/10 bg-white/5 p-3.5">
                <div className="flex items-center gap-1.5 text-muted text-xs mb-1">
                  <Sparkles className="size-3.5 text-cyan" />
                  <span>Surveillance</span>
                </div>
                <div className="text-base font-bold text-ink">
                  Gemini Flash AI
                </div>
              </div>

              <div className="rounded-xl border border-white/10 bg-white/5 p-3.5">
                <div className="flex items-center gap-1.5 text-muted text-xs mb-1">
                  <Maximize className="size-3.5 text-cyan" />
                  <span>Lockdown</span>
                </div>
                <div className="text-base font-bold text-ink">
                  Strict 3 Strikes
                </div>
              </div>
            </div>

            {/* Existing Session Alert */}
            {assessment.existingSession && (
              <div className="mt-5 rounded-xl border border-flag/30 bg-flag/10 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-semibold text-ink">Previous Session Found</h4>
                    <p className="text-xs text-muted mt-0.5">
                      Status: <span className="font-semibold text-ink">{assessment.existingSession.status}</span> • Strikes: {assessment.existingSession.strikes}/3
                    </p>
                  </div>
                  {assessment.existingSession.status === 'IN_PROGRESS' && (
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => navigate(`/assessments/${assessment.id}/arena`)}
                    >
                      Resume Session
                    </Button>
                  )}
                </div>
              </div>
            )}
          </GlassCard>

          {/* Pre-Flight Security Check & Live Preview */}
          <GlassCard className="p-6 sm:p-8">
            <h3 className="text-lg font-bold font-display text-ink mb-2">
              System Pre-Flight Compatibility Check
            </h3>
            <p className="text-xs sm:text-sm text-muted mb-6">
              Our AI surveillance engine requires webcam access and browser fullscreen capability to ensure academic integrity.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
              {/* Check items list */}
              <div className="space-y-4">
                {/* 1. Camera check */}
                <div className="flex items-start justify-between p-3.5 rounded-xl border border-white/10 bg-white/5">
                  <div className="flex items-start gap-3">
                    <Camera className="size-5 text-cyan shrink-0 mt-0.5" />
                    <div>
                      <div className="text-sm font-semibold text-ink">Webcam Feed Access</div>
                      <div className="text-xs text-muted">
                        Continuous off-screen proctoring frame snapshots
                      </div>
                    </div>
                  </div>
                  <div>
                    {cameraStatus === 'success' && (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-good">
                        <CheckCircle2 className="size-4" /> Ready
                      </span>
                    )}
                    {cameraStatus === 'failed' && (
                      <button
                        onClick={() => void runCameraCheck()}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-bad hover:underline"
                      >
                        <XCircle className="size-4" /> Grant Access
                      </button>
                    )}
                    {cameraStatus === 'pending' && (
                      <span className="text-xs text-muted animate-pulse">Requesting...</span>
                    )}
                  </div>
                </div>

                {/* 2. Fullscreen capability */}
                <div className="flex items-start justify-between p-3.5 rounded-xl border border-white/10 bg-white/5">
                  <div className="flex items-start gap-3">
                    <Maximize className="size-5 text-cyan shrink-0 mt-0.5" />
                    <div>
                      <div className="text-sm font-semibold text-ink">Fullscreen API Support</div>
                      <div className="text-xs text-muted">
                        Prevents background application switching
                      </div>
                    </div>
                  </div>
                  <div>
                    {fullscreenSupported ? (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-good">
                        <CheckCircle2 className="size-4" /> Supported
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-bad">
                        <XCircle className="size-4" /> Unsupported Browser
                      </span>
                    )}
                  </div>
                </div>

                {/* 3. Candidate Account */}
                <div className="flex items-start justify-between p-3.5 rounded-xl border border-white/10 bg-white/5">
                  <div className="flex items-start gap-3">
                    <ShieldCheck className="size-5 text-cyan shrink-0 mt-0.5" />
                    <div>
                      <div className="text-sm font-semibold text-ink">Candidate Identity</div>
                      <div className="text-xs text-muted">
                        {user?.name} ({user?.email})
                      </div>
                    </div>
                  </div>
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-good">
                    <CheckCircle2 className="size-4" /> Verified
                  </span>
                </div>
              </div>

              {/* Camera Video Preview Box */}
              <div className="flex flex-col items-center justify-center">
                <div className="relative w-full max-w-sm aspect-video rounded-2xl bg-black border border-white/15 overflow-hidden shadow-inner flex items-center justify-center">
                  <video
                    ref={videoPreviewRef}
                    autoPlay
                    playsInline
                    muted
                    className={`size-full object-cover -scale-x-100 ${
                      cameraStatus === 'success' ? 'block' : 'hidden'
                    }`}
                  />
                  {cameraStatus !== 'success' && (
                    <div className="p-4 text-center">
                      <Camera className="size-8 text-muted mx-auto mb-2 opacity-50" />
                      <p className="text-xs text-muted">
                        {cameraStatus === 'failed'
                          ? 'Camera permission denied. Click "Grant Access" to retry.'
                          : 'Waiting for camera feed...'}
                      </p>
                    </div>
                  )}
                  {cameraStatus === 'success' && (
                    <div className="absolute bottom-2 left-2 rounded-full bg-black/60 px-2.5 py-0.5 text-[10px] font-medium text-good border border-good/30 backdrop-blur">
                      ● Camera Active
                    </div>
                  )}
                </div>
                <p className="text-[11px] text-muted text-center mt-2">
                  Live pre-flight feed. Ensure your face is centered and lighting is adequate.
                </p>
              </div>
            </div>
          </GlassCard>

          {/* Anti-Cheat Rules & Acknowledgment */}
          <GlassCard className="p-6 sm:p-8 space-y-5">
            <h3 className="text-lg font-bold font-display text-ink">
              Anti-Cheat Policy & Arena Security Rules
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-muted">
              <div className="rounded-xl border border-white/10 bg-white/5 p-3.5 space-y-1">
                <div className="font-semibold text-ink flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-cyan" />
                  Mandatory Fullscreen Mode
                </div>
                <p>
                  You cannot exit fullscreen mode during the test. Exiting fullscreen counts as an immediate strike.
                </p>
              </div>

              <div className="rounded-xl border border-white/10 bg-white/5 p-3.5 space-y-1">
                <div className="font-semibold text-ink flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-cyan" />
                  Tab Switching & Blur Detection
                </div>
                <p>
                  Navigating to other browser tabs or clicking outside the window triggers an automatic violation.
                </p>
              </div>

              <div className="rounded-xl border border-white/10 bg-white/5 p-3.5 space-y-1">
                <div className="font-semibold text-ink flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-bad" />
                  Strict 3-Strike Disqualification
                </div>
                <p>
                  Violation 1: Warning modal. Violation 2: Final warning. Violation 3: Immediate auto-submission.
                </p>
              </div>

              <div className="rounded-xl border border-white/10 bg-white/5 p-3.5 space-y-1">
                <div className="font-semibold text-ink flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-bad" />
                  Page Reload / Exit Interception
                </div>
                <p>
                  Reloading or closing the tab triggers instant beacon auto-submission of your current code.
                </p>
              </div>
            </div>

            <div className="pt-2">
              <label className="flex items-start gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={rulesAgreed}
                  onChange={(e) => setRulesAgreed(e.target.checked)}
                  className="mt-1 size-4 rounded border-white/20 bg-white/10 text-cyan focus:ring-cyan focus:ring-offset-0 cursor-pointer"
                />
                <span className="text-xs text-muted leading-relaxed">
                  I understand and agree to the anti-cheat policy. I consent to webcam snapshots being analyzed in-memory by AI for the duration of this assessment.
                </span>
              </label>
            </div>

            {/* Launch Button */}
            <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-white/10">
              <div className="text-xs text-muted">
                {assessment.windowState !== 'OPEN' ? (
                  <span className="text-bad font-semibold">
                    Assessment is currently outside its active test window.
                  </span>
                ) : cameraStatus !== 'success' ? (
                  <span className="text-flag font-semibold">
                    Webcam access is required before starting.
                  </span>
                ) : !rulesAgreed ? (
                  <span>Please check the agreement box to proceed.</span>
                ) : (
                  <span className="text-good font-semibold">
                    All pre-flight checks passed! Ready to enter arena.
                  </span>
                )}
              </div>

              <Button
                variant="primary"
                size="lg"
                disabled={
                  assessment.windowState !== 'OPEN' ||
                  cameraStatus !== 'success' ||
                  !rulesAgreed ||
                  (assessment.existingSession?.status !== undefined &&
                    assessment.existingSession.status !== 'IN_PROGRESS')
                }
                onClick={() => void handleEnterArena()}
                className="w-full sm:w-auto justify-center px-8 py-3 text-sm font-semibold shadow-glow"
              >
                Enter Proctored Arena
                <ArrowRight className="size-4 ml-2" />
              </Button>
            </div>
          </GlassCard>
        </div>
      )}
    </div>
  )
}
