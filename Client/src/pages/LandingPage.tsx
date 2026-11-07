import { Link } from 'react-router-dom'
import { ArrowRight, Code2, Mic } from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import { GlassCard, VerdictBadge } from '../components/ui'

const modules = [
  {
    to: '/practice',
    icon: Code2,
    title: 'Coding practice',
    text: 'Solve LeetCode-style problems in a multi-language editor and get a verdict in seconds.',
    points: ['Python, C++, Java and JavaScript', 'Sample and hidden test cases', 'Hints that cost points, not answers'],
    cta: 'Open coding practice',
    glow: 'bg-violet/25',
  },
  {
    to: '/interview',
    icon: Mic,
    title: 'Mock interview',
    text: 'Answer out loud and an AI interviewer scores you and adapts the next question.',
    points: ['OS, DBMS and Data Structures', 'You pick the difficulty and length', 'Type your answers if the mic is off'],
    cta: 'Open mock interview',
    glow: 'bg-cyan/20',
  },
] as const

const steps = [
  { title: 'Solve a problem', text: 'Write code in the editor and submit it.' },
  { title: 'Read the verdict', text: 'See which test cases passed and how fast.' },
  { title: 'Explain your thinking', text: 'Talk it through with the AI interviewer.' },
]

export default function LandingPage() {
  const user = useAuthStore((s) => s.user)

  return (
    <div className="flex flex-col gap-24">
      <section className="grid items-center gap-12 lg:grid-cols-[1.1fr_1fr]">
        <div className="flex flex-col items-start gap-6">
          <h1 className="text-5xl font-bold leading-[1.05] sm:text-6xl">
            Solve it.
            <br />
            Then explain it.
          </h1>
          <p className="max-w-lg text-lg text-muted">
            Practice coding problems in a sandboxed editor, then talk through your approach with an
            AI interviewer that adapts to your answers.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link
              to={user ? '/practice' : '/signup'}
              className="inline-flex h-14 items-center gap-2 rounded-full bg-brand px-8 text-[1rem] font-semibold shadow-glow transition hover:brightness-110"
            >
              {user ? 'Continue practicing' : 'Get started free'}
              <ArrowRight className="size-5" aria-hidden />
            </Link>
            <Link
              to="/interview"
              className="inline-flex h-14 items-center rounded-full border border-white/10 bg-white/5 px-8 text-[1rem] font-semibold backdrop-blur-xl transition hover:bg-white/10"
            >
              Try a mock interview
            </Link>
          </div>
        </div>

        <GlassCard strong className="flex flex-col gap-5 p-6" aria-label="Product preview">
          <div className="flex items-center justify-between">
            <span className="font-display text-lg font-semibold">1. Two Sum</span>
            <VerdictBadge verdict="ACCEPTED" />
          </div>
          <p className="font-mono text-sm text-muted">3/3 tests · 42 ms · 14 MB</p>
          <div className="flex flex-col gap-3 border-t border-white/10 pt-5 text-sm">
            <p className="max-w-[85%] rounded-ctl bg-cyan/10 px-4 py-3">
              <span className="font-mono text-cyan">ai&gt;</span> Why did you pick a hash map over sorting?
            </p>
            <p className="ml-auto max-w-[85%] rounded-ctl bg-violet/20 px-4 py-3">
              <span className="font-mono text-pink">you&gt;</span> Lookup is O(1), so one pass is enough.
            </p>
          </div>
        </GlassCard>
      </section>

      <section aria-labelledby="modules-title" className="flex flex-col gap-8">
        <h2 id="modules-title" className="text-3xl font-bold">
          Two ways to practice
        </h2>
        <div className="grid gap-6 md:grid-cols-2">
          {modules.map(({ to, icon: Icon, title, text, points, cta, glow }) => (
            <Link key={to} to={to} className="group relative block overflow-hidden rounded-card">
              <GlassCard className="flex h-full flex-col gap-5 p-8 transition duration-300 group-hover:border-white/25">
                <div aria-hidden className={`absolute -right-16 -top-16 size-56 rounded-full blur-[80px] ${glow}`} />
                <span className="relative grid size-12 place-items-center rounded-ctl bg-white/10">
                  <Icon className="size-6" aria-hidden />
                </span>
                <div className="relative flex flex-col gap-2">
                  <h3 className="text-2xl font-semibold">{title}</h3>
                  <p className="text-muted">{text}</p>
                </div>
                <ul className="relative flex flex-col gap-2 text-sm text-muted">
                  {points.map((p) => (
                    <li key={p} className="flex items-center gap-2">
                      <span className="size-1.5 rounded-full bg-cyan" aria-hidden />
                      {p}
                    </li>
                  ))}
                </ul>
                <span className="relative mt-auto inline-flex items-center gap-2 font-semibold text-cyan">
                  {cta}
                  <ArrowRight className="size-4 transition group-hover:translate-x-1" aria-hidden />
                </span>
              </GlassCard>
            </Link>
          ))}
        </div>
      </section>

      <section aria-labelledby="flow-title" className="flex flex-col gap-8">
        <h2 id="flow-title" className="text-3xl font-bold">
          How a session works
        </h2>
        <ol className="grid gap-6 md:grid-cols-3">
          {steps.map((s, i) => (
            <li key={s.title} className="flex gap-4">
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand font-mono text-sm font-bold">
                {i + 1}
              </span>
              <div>
                <h3 className="font-semibold">{s.title}</h3>
                <p className="text-sm text-muted">{s.text}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </div>
  )
}
