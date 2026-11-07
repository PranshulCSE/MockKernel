import { useState } from 'react'
import { Badge, Chip, GlassCard } from '../components/ui'
import { useAuthStore } from '../store/authStore'
import { sampleProblems, type Difficulty } from '../features/practice/problems'

const languages = ['Python', 'C++', 'Java', 'JavaScript']
const filters: Array<'All' | Difficulty> = ['All', 'Easy', 'Medium', 'Hard']
const tone = { Easy: 'ok', Medium: 'warn', Hard: 'bad' } as const

const stats = [
  { label: 'Solved', value: 0 },
  { label: 'Attempted', value: 0 },
  { label: 'Contests joined', value: 0 },
]

export default function PracticePage() {
  const user = useAuthStore((s) => s.user)
  const [filter, setFilter] = useState<'All' | Difficulty>('All')
  const list = sampleProblems.filter((p) => filter === 'All' || p.difficulty === filter)

  return (
    <div className="flex flex-col gap-12">
      <section className="flex flex-col gap-4">
        <h1 className="text-5xl font-bold leading-[1.05]">Coding practice</h1>
        <p className="max-w-xl text-lg text-muted">
          Hi {user?.name.split(' ')[0]}, pick a problem and write your solution in any of four languages.
        </p>
        <ul className="flex flex-wrap gap-2" aria-label="Supported languages">
          {languages.map((l) => (
            <li key={l}>
              <Badge className="font-mono">{l}</Badge>
            </li>
          ))}
        </ul>
      </section>

      <section className="grid gap-4 sm:grid-cols-3" aria-label="Your progress">
        {stats.map((s) => (
          <GlassCard key={s.label} className="flex flex-col gap-1">
            <span className="font-mono text-4xl font-bold">{s.value}</span>
            <span className="text-sm text-muted">{s.label}</span>
          </GlassCard>
        ))}
      </section>

      <section className="flex flex-col gap-5" aria-labelledby="problems-title">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h2 id="problems-title" className="text-2xl font-semibold">
            Sample problems
          </h2>
          <div className="flex gap-2" role="group" aria-label="Filter by difficulty">
            {filters.map((f) => (
              <Chip key={f} selected={filter === f} onClick={() => setFilter(f)}>
                {f}
              </Chip>
            ))}
          </div>
        </div>

        <ul className="flex flex-col gap-3">
          {list.map((p) => (
            <li key={p.id}>
              <GlassCard className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
                <div className="flex flex-col">
                  <span className="font-semibold">{p.title}</span>
                  <span className="text-sm text-muted">{p.topic}</span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="font-mono text-sm text-muted">{p.acceptance}% accepted</span>
                  <Badge tone={tone[p.difficulty]}>{p.difficulty}</Badge>
                </div>
              </GlassCard>
            </li>
          ))}
        </ul>

        <p className="text-sm text-muted">
          The problem workspace with the code editor opens in the next phase.
        </p>
      </section>
    </div>
  )
}
