import { useEffect, useRef, useState, useCallback } from 'react'
import {
  Camera,
  CameraOff,
  AlertTriangle,
  ShieldCheck,
  Smartphone,
  Users,
  Eye,
  Minimize2,
  Maximize2,
  RefreshCw,
} from 'lucide-react'
import { assessmentsApi, type ProctorAnalysisResult } from '../../api/assessments'

interface ProctorCameraProps {
  assessmentId: string
  isActive: boolean
  onAnalysisUpdate?: (result: ProctorAnalysisResult) => void
  onViolationAlert?: (result: ProctorAnalysisResult) => void
}

export function ProctorCamera({
  assessmentId,
  isActive,
  onAnalysisUpdate,
  onViolationAlert,
}: ProctorCameraProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const [hasPermission, setHasPermission] = useState<boolean | null>(null)
  const [errorMessage, setErrorMessage] = useState<string>('')
  const [isMinimized, setIsMinimized] = useState<boolean>(false)
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false)
  const [lastAnalysis, setLastAnalysis] = useState<ProctorAnalysisResult | null>(null)

  // Start webcam stream
  const startCamera = useCallback(async () => {
    try {
      setErrorMessage('')
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop())
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: 'user',
        },
        audio: false,
      })

      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        void videoRef.current.play().catch(() => {})
      }
      setHasPermission(true)
    } catch (err: unknown) {
      console.error('[ProctorCamera] Error accessing camera:', err)
      setHasPermission(false)
      const errName = (err as Error)?.name
      if (errName === 'NotAllowedError' || errName === 'PermissionDeniedError') {
        setErrorMessage('Camera access was denied. Please grant webcam permissions.')
      } else if (errName === 'NotFoundError' || errName === 'DevicesNotFoundError') {
        setErrorMessage('No camera device found. A working webcam is required.')
      } else {
        setErrorMessage('Unable to connect to camera. Please check your browser settings.')
      }
    }
  }, [])

  // Stop webcam stream
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
  }, [])

  // Initial mount: start camera if active
  useEffect(() => {
    let cancelled = false
    const timer = window.setTimeout(() => {
      if (!cancelled && isActive) {
        void startCamera()
      }
    }, 0)
    if (!isActive) {
      stopCamera()
    }

    return () => {
      cancelled = true
      window.clearTimeout(timer)
      stopCamera()
    }
  }, [isActive, startCamera, stopCamera])

  // Capture frame and send to Gemini proctoring endpoint
  const captureAndAnalyze = useCallback(async () => {
    if (!isActive || !videoRef.current || !hasPermission) return
    const video = videoRef.current
    if (video.videoWidth === 0 || video.videoHeight === 0) return

    // Off-screen canvas snapshot
    const canvas = canvasRef.current || document.createElement('canvas')
    canvasRef.current = canvas
    canvas.width = 480
    canvas.height = 360

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Draw video frame to canvas
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

    // Export base64 JPEG in memory (low-moderate quality for fast transmission)
    const base64 = canvas.toDataURL('image/jpeg', 0.65)

    try {
      setIsAnalyzing(true)
      const result = await assessmentsApi.sendProctorFrame(assessmentId, base64)
      setLastAnalysis(result)
      onAnalysisUpdate?.(result)

      if (result.flagged) {
        onViolationAlert?.(result)
      }
    } catch (err) {
      console.warn('[ProctorCamera] Frame analysis request failed:', err)
    } finally {
      setIsAnalyzing(false)
    }
  }, [assessmentId, hasPermission, isActive, onAnalysisUpdate, onViolationAlert])

  // Periodic capture interval: every 12 seconds
  useEffect(() => {
    if (!isActive || hasPermission !== true) return

    // Initial check after 3 seconds for fast readiness
    const initialTimer = setTimeout(() => {
      void captureAndAnalyze()
    }, 3000)

    const interval = setInterval(() => {
      void captureAndAnalyze()
    }, 12000)

    return () => {
      clearTimeout(initialTimer)
      clearInterval(interval)
    }
  }, [isActive, hasPermission, captureAndAnalyze])

  const getStatusBadge = () => {
    if (hasPermission === false) {
      return {
        label: 'Camera Blocked',
        tone: 'bg-bad/20 text-bad border-bad/40',
        icon: CameraOff,
      }
    }

    if (!lastAnalysis || lastAnalysis.type === 'clean' || !lastAnalysis.flagged) {
      return {
        label: isAnalyzing ? 'Analyzing Frame...' : 'Verified & Focused',
        tone: 'bg-good/20 text-good border-good/40',
        icon: ShieldCheck,
      }
    }

    switch (lastAnalysis.type) {
      case 'no_face_detected':
        return {
          label: 'No Face Detected',
          tone: 'bg-flag/20 text-flag border-flag/40',
          icon: AlertTriangle,
        }
      case 'multiple_faces_detected':
        return {
          label: 'Multiple People Visible',
          tone: 'bg-bad/20 text-bad border-bad/40',
          icon: Users,
        }
      case 'electronic_device_present':
        return {
          label: 'Device Detected',
          tone: 'bg-bad/20 text-bad border-bad/40',
          icon: Smartphone,
        }
      case 'suspicious_gaze':
        return {
          label: 'Looking Away',
          tone: 'bg-flag/20 text-flag border-flag/40',
          icon: Eye,
        }
      default:
        return {
          label: 'Flagged Activity',
          tone: 'bg-bad/20 text-bad border-bad/40',
          icon: AlertTriangle,
        }
    }
  }

  const status = getStatusBadge()
  const StatusIcon = status.icon

  return (
    <div
      className={`fixed bottom-4 right-4 z-40 transition-all duration-300 ${
        isMinimized ? 'w-44' : 'w-64 sm:w-72'
      } rounded-2xl border border-white/15 bg-base/90 p-2 shadow-2xl backdrop-blur-xl`}
    >
      {/* Header bar */}
      <div className="flex items-center justify-between px-2 py-1 mb-1.5">
        <div className="flex items-center gap-1.5">
          <span className="relative flex size-2">
            <span
              className={`absolute inline-flex size-full animate-ping rounded-full ${
                hasPermission ? 'bg-good opacity-75' : 'bg-bad opacity-75'
              }`}
            />
            <span
              className={`relative inline-flex size-2 rounded-full ${
                hasPermission ? 'bg-good' : 'bg-bad'
              }`}
            />
          </span>
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">
            AI Proctor
          </span>
        </div>

        <button
          type="button"
          onClick={() => setIsMinimized((prev) => !prev)}
          className="text-muted hover:text-ink p-1 rounded transition-colors"
          title={isMinimized ? 'Expand Camera' : 'Minimize Camera'}
        >
          {isMinimized ? <Maximize2 className="size-3.5" /> : <Minimize2 className="size-3.5" />}
        </button>
      </div>

      {/* Video stream container */}
      <div
        className={`relative overflow-hidden rounded-xl bg-black border border-white/10 ${
          isMinimized ? 'h-24' : 'h-36 sm:h-40'
        }`}
      >
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={`size-full object-cover -scale-x-100 ${
            hasPermission ? 'opacity-100' : 'opacity-0'
          }`}
        />

        {/* Permission Denied / Error state */}
        {hasPermission === false && (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-3 text-center bg-black/90">
            <CameraOff className="size-6 text-bad mb-1.5" />
            <p className="text-[11px] text-bad font-medium mb-2 leading-tight">
              {errorMessage || 'Camera required'}
            </p>
            <button
              onClick={() => void startCamera()}
              className="inline-flex items-center gap-1 rounded bg-white/10 px-2 py-1 text-[11px] text-ink hover:bg-white/20 transition-colors"
            >
              <RefreshCw className="size-3" /> Retry
            </button>
          </div>
        )}

        {/* Loading / Connecting state */}
        {hasPermission === null && (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-3 text-center bg-black/80">
            <Camera className="size-6 text-cyan animate-pulse mb-1" />
            <p className="text-[11px] text-muted">Connecting camera...</p>
          </div>
        )}

        {/* Live Status overlay pill */}
        {hasPermission && (
          <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between pointer-events-none">
            <div
              className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-medium border backdrop-blur-md ${status.tone}`}
            >
              <StatusIcon className="size-3" />
              <span className="truncate max-w-[140px]">{status.label}</span>
            </div>

            {lastAnalysis && lastAnalysis.suspicionScore > 0 && (
              <span className="rounded-full bg-black/60 px-1.5 py-0.5 text-[9px] font-mono text-muted">
                {lastAnalysis.suspicionScore}%
              </span>
            )}
          </div>
        )}
      </div>

      {/* Warning banner underneath if flagged */}
      {!isMinimized && lastAnalysis?.flagged && (
        <div className="mt-2 rounded-lg bg-bad/10 border border-bad/30 p-1.5 text-left">
          <p className="text-[11px] text-bad font-medium flex items-center gap-1 leading-tight">
            <AlertTriangle className="size-3 shrink-0" />
            <span>{lastAnalysis.reason}</span>
          </p>
        </div>
      )}
    </div>
  )
}
