import { Terminal } from 'lucide-react'

export function Logo() {
  return (
    <span className="inline-flex items-center gap-2.5 font-display text-xl font-bold tracking-tight">
      <span className="grid size-8 place-items-center rounded-lg bg-brand shadow-glow">
        <Terminal className="size-4 text-white" aria-hidden />
      </span>
      MockKernel
    </span>
  )
}
