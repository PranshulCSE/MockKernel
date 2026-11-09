import { useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { Info, Mic } from 'lucide-react'
import { Badge, Button, Chip, GlassCard } from '../components/ui'

const topics = ['Operating Systems', 'DBMS', 'Data Structures'] as const
const levels = ['Easy', 'Medium', 'Hard'] as const
const counts = [5, 8, 10] as const

function VoiceOrb() {
  const reduce = useReducedMotion()
  return (
    <div className="relative grid size-64 place-items-center" aria-hidden>
      {[0, 1].map((i) => (
        <motion.span
          key={i}
          className="absolute inset-0 rounded-full border border-cyan/30"
          animate={reduce ? undefined : { scale: [1, 1.35], opacity: [0.6, 0] }}
          transition={{ duration: 2.8, repeat: Infinity, delay: i * 1.4, ease: 'easeOut' }}
        />
      ))}
      <div className="grid size-40 place-items-center rounded-full bg-brand shadow-[0_0_80px_rgba(6,182,212,.35)]">
        <Mic className="size-12 text-white" />
      </div>
    </div>
  )
}

export default function InterviewPage() {
  const [picked, setPicked] = useState<string[]>([...topics])
  const [level, setLevel] = useState<(typeof levels)[number]>('Medium')
  const [count, setCount] = useState<(typeof counts)[number]>(8)
  const [started, setStarted] = useState(false)

  const toggle = (t: string) =>
    setPicked((p) => (p.includes(t) ? (p.length > 1 ? p.filter((x) => x !== t) : p) : [...p, t]))

  return (
    <div className="flex flex-col gap-16">
      <section className="grid items-center gap-10 lg:grid-cols-[1.2fr_1fr]">
        <div className="flex flex-col items-start gap-5">
          <h1 className="text-5xl font-bold leading-[1.05]">Mock interview</h1>
          <p className="max-w-lg text-lg text-muted">
            Answer CS fundamentals questions out loud. The interviewer scores each answer and picks
            a harder or easier follow-up based on how you did.
          </p>
        </div>
        <div className="flex justify-center">
          <VoiceOrb />
        </div>
      </section>

      <GlassCard strong className="flex flex-col gap-8 p-8" aria-labelledby="setup-title">
        <h2 id="setup-title" className="text-2xl font-semibold">
          Set up your session
        </h2>

        <fieldset className="flex flex-col gap-3">
          <legend className="mb-3 text-sm font-medium">Topics</legend>
          <div className="flex flex-wrap gap-2">
            {topics.map((t) => (
              <Chip key={t} selected={picked.includes(t)} onClick={() => toggle(t)}>
                {t}
              </Chip>
            ))}
          </div>
        </fieldset>

        <div className="grid gap-8 sm:grid-cols-2">
          <fieldset>
            <legend className="mb-3 text-sm font-medium">Difficulty</legend>
            <div className="flex flex-wrap gap-2">
              {levels.map((l) => (
                <Chip key={l} selected={level === l} onClick={() => setLevel(l)}>
                  {l}
                </Chip>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="mb-3 text-sm font-medium">Number of questions</legend>
            <div className="flex flex-wrap gap-2">
              {counts.map((c) => (
                <Chip key={c} selected={count === c} onClick={() => setCount(c)}>
                  {c} questions
                </Chip>
              ))}
            </div>
          </fieldset>
        </div>

        <p className="flex items-start gap-2 text-sm text-muted">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
          Voice needs microphone access. If it is blocked or unsupported, you can type your answers
          instead.
        </p>

        <div className="flex flex-wrap items-center gap-4 border-t border-white/10 pt-6">
          <Button size="lg" leftIcon={<Mic className="size-5" />} onClick={() => setStarted(true)}>
            Start interview
          </Button>
          <span className="text-sm text-muted">
            {count} {level.toLowerCase()} questions on {picked.length} topic{picked.length > 1 ? 's' : ''}
          </span>
          {started && (
            <Badge tone="run" role="status">
              The interview room is built in the next phase.
            </Badge>
          )}
        </div>
      </GlassCard>
    </div>
  )
}
