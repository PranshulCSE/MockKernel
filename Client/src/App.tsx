import { Mail, Lock } from 'lucide-react'
import { Background } from './components/layout/Background'
import { Logo } from './components/layout/Logo'
import { Badge, Button, GlassCard, Input, VerdictBadge } from './components/ui'
import type { Verdict } from './types/verdict'

const verdicts: Verdict[] = [
  'PENDING',
  'ACCEPTED',
  'WRONG_ANSWER',
  'TLE',
  'RUNTIME_ERROR',
  'COMPILE_ERROR',
  'PLAGIARISM_FLAGGED',
]

// Temporary design-system preview. Replaced by the router in the next step.
export default function App() {
  return (
    <>
      <Background />
      <main className="mx-auto flex max-w-4xl flex-col gap-8 px-6 py-12">
        <header className="flex items-center justify-between">
          <Logo />
          <Badge tone="ok">Design system preview</Badge>
        </header>

        <GlassCard className="flex flex-col gap-4">
          <h1 className="text-3xl font-bold">Buttons</h1>
          <div className="flex flex-wrap items-center gap-3">
            <Button>Submit</Button>
            <Button variant="secondary">Run code</Button>
            <Button variant="ghost">Cancel</Button>
            <Button loading>Saving</Button>
            <Button disabled>Disabled</Button>
          </div>
        </GlassCard>

        <GlassCard className="flex flex-col gap-4">
          <h2 className="text-xl font-semibold">Inputs</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Email" type="email" placeholder="you@college.edu" leftIcon={<Mail className="size-4" />} />
            <Input
              label="Password"
              type="password"
              defaultValue="abc"
              error="Use at least 8 characters."
              leftIcon={<Lock className="size-4" />}
            />
          </div>
        </GlassCard>

        <GlassCard className="flex flex-col gap-4">
          <h2 className="text-xl font-semibold">Verdict states</h2>
          <div className="flex flex-wrap gap-2">
            {verdicts.map((v) => (
              <VerdictBadge key={v} verdict={v} />
            ))}
          </div>
        </GlassCard>
      </main>
    </>
  )
}
