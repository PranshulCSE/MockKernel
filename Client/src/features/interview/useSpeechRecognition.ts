import { useState, useEffect, useRef, useCallback } from 'react'

interface SpeechRecognitionEventLike extends Event {
  results: {
    [index: number]: {
      [index: number]: {
        transcript: string
      }
      isFinal: boolean
    }
    length: number
  }
  resultIndex: number
}

interface SpeechRecognitionErrorEventLike extends Event {
  error: string
  message?: string
}

interface SpeechRecognitionInstance extends EventTarget {
  continuous: boolean
  interimResults: boolean
  lang: string
  start: () => void
  stop: () => void
  abort: () => void
  onstart: ((this: SpeechRecognitionInstance, ev: Event) => void) | null
  onend: ((this: SpeechRecognitionInstance, ev: Event) => void) | null
  onerror: ((this: SpeechRecognitionInstance, ev: SpeechRecognitionErrorEventLike) => void) | null
  onresult: ((this: SpeechRecognitionInstance, ev: SpeechRecognitionEventLike) => void) | null
}

type SpeechRecognitionCtor = new () => SpeechRecognitionInstance

interface WindowWithSpeech extends Window {
  SpeechRecognition?: SpeechRecognitionCtor
  webkitSpeechRecognition?: SpeechRecognitionCtor
  AudioContext?: typeof AudioContext
  webkitAudioContext?: typeof AudioContext
}

export function useSpeechRecognition() {
  const [isSupported, setIsSupported] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [interimTranscript, setInterimTranscript] = useState('')
  const [permissionDenied, setPermissionDenied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [audioLevel, setAudioLevel] = useState(0)

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const animationFrameRef = useRef<number | null>(null)

  useEffect(() => {
    const win = window as unknown as WindowWithSpeech
    const RecognitionClass = win.SpeechRecognition || win.webkitSpeechRecognition
    setIsSupported(Boolean(RecognitionClass))
  }, [])

  // Audio level analysis
  const setupAudioMeter = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      mediaStreamRef.current = stream

      const win = window as unknown as WindowWithSpeech
      const AudioCtx = win.AudioContext || win.webkitAudioContext
      if (!AudioCtx) return

      const ctx = new AudioCtx()
      audioContextRef.current = ctx
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 256
      analyserRef.current = analyser

      const source = ctx.createMediaStreamSource(stream)
      source.connect(analyser)

      const bufferLength = analyser.frequencyBinCount
      const dataArray = new Uint8Array(bufferLength)

      const updateMeter = () => {
        if (!analyserRef.current) return
        analyserRef.current.getByteFrequencyData(dataArray)
        let sum = 0
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i]
        }
        const avg = sum / bufferLength
        // Normalize roughly between 0 and 1
        setAudioLevel(Math.min(1, avg / 60))
        animationFrameRef.current = requestAnimationFrame(updateMeter)
      }

      updateMeter()
    } catch {
      // Permission denied or mic unavailable
      setPermissionDenied(true)
    }
  }

  const cleanupAudio = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop())
      mediaStreamRef.current = null
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      void audioContextRef.current.close()
      audioContextRef.current = null
    }
    analyserRef.current = null
    setAudioLevel(0)
  }

  const startListening = useCallback(async () => {
    setError(null)
    const win = window as unknown as WindowWithSpeech
    const RecognitionClass = win.SpeechRecognition || win.webkitSpeechRecognition

    if (!RecognitionClass) {
      setIsSupported(false)
      setError('Web Speech API is not supported in this browser.')
      return
    }

    try {
      await setupAudioMeter()

      if (!recognitionRef.current) {
        const recognition = new RecognitionClass()
        recognition.continuous = true
        recognition.interimResults = true
        recognition.lang = 'en-US'

        recognition.onstart = () => {
          setIsListening(true)
          setPermissionDenied(false)
        }

        recognition.onresult = (event: SpeechRecognitionEventLike) => {
          let currentInterim = ''
          let currentFinal = ''

          for (let i = event.resultIndex; i < event.results.length; ++i) {
            const piece = event.results[i][0].transcript
            if (event.results[i].isFinal) {
              currentFinal += piece + ' '
            } else {
              currentInterim += piece
            }
          }

          if (currentFinal) {
            setTranscript((prev) => (prev ? `${prev.trim()} ${currentFinal.trim()}` : currentFinal.trim()))
          }
          setInterimTranscript(currentInterim)
        }

        recognition.onerror = (event: SpeechRecognitionErrorEventLike) => {
          if (event.error === 'not-allowed' || event.error === 'permission-denied') {
            setPermissionDenied(true)
            setError('Microphone access was denied. Please allow microphone access or type your answers below.')
          } else if (event.error !== 'no-speech') {
            setError(`Speech recognition notice: ${event.error}`)
          }
          setIsListening(false)
          cleanupAudio()
        }

        recognition.onend = () => {
          setIsListening(false)
          cleanupAudio()
        }

        recognitionRef.current = recognition
      }

      recognitionRef.current.start()
    } catch {
      setPermissionDenied(true)
      setIsListening(false)
      cleanupAudio()
    }
  }, [])

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop()
      } catch {
        // ignore
      }
    }
    setIsListening(false)
    cleanupAudio()
  }, [])

  const resetTranscript = useCallback(() => {
    setTranscript('')
    setInterimTranscript('')
  }, [])

  const setManualTranscript = useCallback((text: string) => {
    setTranscript(text)
  }, [])

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort()
        } catch {
          // ignore
        }
      }
      cleanupAudio()
    }
  }, [])

  return {
    isSupported,
    isListening,
    transcript,
    interimTranscript,
    audioLevel,
    permissionDenied,
    error,
    startListening,
    stopListening,
    resetTranscript,
    setManualTranscript,
  }
}
