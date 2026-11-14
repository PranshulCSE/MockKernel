import { useEffect, useRef, useState, useCallback } from 'react'
import { assessmentsApi } from '../api/assessments'

export interface ProctoringLockOptions {
  assessmentId: string
  userId?: string
  sessionId?: string
  isActive: boolean
  initialStrikes?: number
  getCodeSubmissions?: () => Record<string, any>
  onAutoSubmitted?: (reason: string) => void
}

export function useProctoringLock({
  assessmentId,
  userId,
  sessionId,
  isActive,
  initialStrikes = 0,
  getCodeSubmissions,
  onAutoSubmitted,
}: ProctoringLockOptions) {
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false)
  const [strikes, setStrikes] = useState<number>(initialStrikes)
  const [warningModalOpen, setWarningModalOpen] = useState<boolean>(false)
  const [warningMessage, setWarningMessage] = useState<string>('')
  const [isTerminated, setIsTerminated] = useState<boolean>(false)

  const strikesRef = useRef(strikes)
  strikesRef.current = strikes

  const isTerminatedRef = useRef(isTerminated)
  isTerminatedRef.current = isTerminated

  const lastViolationTimeRef = useRef<number>(0)

  // Request fullscreen
  const requestFullscreen = useCallback(async () => {
    try {
      const docEl = document.documentElement as HTMLElement & {
        webkitRequestFullscreen?: () => Promise<void>
        msRequestFullscreen?: () => Promise<void>
      }

      if (docEl.requestFullscreen) {
        await docEl.requestFullscreen()
      } else if (docEl.webkitRequestFullscreen) {
        await docEl.webkitRequestFullscreen()
      } else if (docEl.msRequestFullscreen) {
        await docEl.msRequestFullscreen()
      }
      setIsFullscreen(true)
    } catch (err) {
      console.warn('[ProctoringLock] Fullscreen request rejected:', err)
    }
  }, [])

  // Process a violation (strike)
  const handleViolation = useCallback(
    async (type: string, reason: string) => {
      if (!isActive || isTerminatedRef.current) return

      const now = Date.now()
      // Throttle violation events within 2.5 seconds to avoid double-firing (e.g. blur + visibilitychange)
      if (now - lastViolationTimeRef.current < 2500) {
        return
      }
      lastViolationTimeRef.current = now

      const nextStrikes = Math.min(3, strikesRef.current + 1)
      setStrikes(nextStrikes)

      try {
        const response = await assessmentsApi.strike(assessmentId, { type, reason })
        if (response.autoSubmitted || nextStrikes >= 3) {
          setIsTerminated(true)
          setWarningModalOpen(false)
          onAutoSubmitted?.('Assessment auto-submitted due to 3 proctoring violations.')
          return
        }
      } catch (err) {
        console.error('[ProctoringLock] Failed to log strike to backend:', err)
      }

      if (nextStrikes === 1) {
        setWarningMessage('Focus loss or tab switch detected! Strike 1 of 2.')
        setWarningModalOpen(true)
      } else if (nextStrikes === 2) {
        setWarningMessage(
          'FINAL WARNING: Another focus loss or fullscreen exit will automatically terminate and submit your assessment.'
        )
        setWarningModalOpen(true)
      } else if (nextStrikes >= 3) {
        setIsTerminated(true)
        setWarningModalOpen(false)
        onAutoSubmitted?.('Assessment auto-submitted due to maximum strikes exceeded.')
      }
    },
    [assessmentId, isActive, onAutoSubmitted]
  )

  // Fullscreen event listener
  useEffect(() => {
    const handleFullscreenChange = () => {
      const isCurrentlyFullscreen = Boolean(
        document.fullscreenElement ||
          (document as any).webkitFullscreenElement ||
          (document as any).msFullscreenElement
      )

      setIsFullscreen(isCurrentlyFullscreen)

      if (isActive && !isCurrentlyFullscreen && !isTerminatedRef.current) {
        void handleViolation(
          'FULLSCREEN_EXIT',
          'Candidate exited fullscreen mode during the proctored test.'
        )
      }
    }

    document.addEventListener('fullscreenchange', handleFullscreenChange)
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange)

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange)
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange)
    }
  }, [isActive, handleViolation])

  // Window blur & visibility change listeners
  useEffect(() => {
    if (!isActive || isTerminated) return

    const handleVisibilityChange = () => {
      if (document.hidden) {
        void handleViolation(
          'TAB_SWITCH_OR_HIDDEN',
          'Candidate navigated away or switched browser tabs.'
        )
      }
    }

    const handleBlur = () => {
      void handleViolation(
        'WINDOW_BLUR',
        'Candidate lost window focus or clicked outside test window.'
      )
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('blur', handleBlur)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('blur', handleBlur)
    }
  }, [isActive, isTerminated, handleViolation])

  // Beforeunload & Beacon fallback auto-submit
  useEffect(() => {
    if (!isActive || isTerminated) return

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      // Show native browser warning dialog
      e.preventDefault()
      e.returnValue = 'Assessment in progress. Leaving or reloading will auto-submit your test.'

      // Fire sendBeacon immediately in case user confirms reload
      const codeSubmissions = getCodeSubmissions ? getCodeSubmissions() : undefined
      assessmentsApi.sendBeaconAutoSubmit(assessmentId, {
        userId,
        sessionId,
        reason: 'Candidate reloaded page, navigated away, or closed browser tab.',
        status: 'AUTO_SUBMITTED_PAGE_RELOAD',
        codeSubmissions,
      })
    }

    window.addEventListener('beforeunload', handleBeforeUnload)

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [assessmentId, userId, sessionId, isActive, isTerminated, getCodeSubmissions])

  // Context menu and keyboard lockdown
  useEffect(() => {
    if (!isActive) return

    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault()
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      // F12
      if (e.key === 'F12' || e.keyCode === 123) {
        e.preventDefault()
        e.stopPropagation()
        return false
      }

      // Ctrl+Shift+I / Cmd+Option+I (Inspect)
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'I' || e.key === 'i')) {
        e.preventDefault()
        e.stopPropagation()
        return false
      }

      // Ctrl+Shift+J / Cmd+Option+J (Console)
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'J' || e.key === 'j')) {
        e.preventDefault()
        e.stopPropagation()
        return false
      }

      // Ctrl+Shift+C (Inspect element)
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'C' || e.key === 'c')) {
        e.preventDefault()
        e.stopPropagation()
        return false
      }

      // Ctrl+U / Cmd+U (View source)
      if ((e.ctrlKey || e.metaKey) && (e.key === 'u' || e.key === 'U')) {
        e.preventDefault()
        e.stopPropagation()
        return false
      }

      // Block Ctrl+C / Ctrl+V in candidate arena (outside Monaco will be caught here)
      if (
        (e.ctrlKey || e.metaKey) &&
        (e.key === 'c' || e.key === 'C' || e.key === 'v' || e.key === 'V')
      ) {
        e.preventDefault()
        e.stopPropagation()
        return false
      }
    }

    window.addEventListener('contextmenu', handleContextMenu)
    window.addEventListener('keydown', handleKeyDown, true)

    return () => {
      window.removeEventListener('contextmenu', handleContextMenu)
      window.removeEventListener('keydown', handleKeyDown, true)
    }
  }, [isActive])

  const dismissWarningModal = useCallback(() => {
    setWarningModalOpen(false)
    // Re-request fullscreen on modal dismiss if it was lost
    if (!isFullscreen) {
      void requestFullscreen()
    }
  }, [isFullscreen, requestFullscreen])

  return {
    isFullscreen,
    strikes,
    warningModalOpen,
    warningMessage,
    isTerminated,
    requestFullscreen,
    dismissWarningModal,
  }
}
