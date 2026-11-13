import {
  CircleDot,
  Check,
  X,
  Timer,
  TriangleAlert,
  Braces,
  ShieldAlert,
  Loader2,
  ServerCrash,
  type LucideIcon,
} from 'lucide-react'
import type { Verdict } from '../../types/verdict'
import { Badge } from './Badge'

type Tone = 'ok' | 'warn' | 'bad' | 'run' | 'flag'

// Verdicts always pair color + icon + text label (never color alone).
const config: Record<Verdict, { label: string; tone: Tone; Icon: LucideIcon }> = {
  PENDING: { label: 'Pending', tone: 'run', Icon: CircleDot },
  RUNNING: { label: 'Running', tone: 'run', Icon: Loader2 },
  ACCEPTED: { label: 'Accepted', tone: 'ok', Icon: Check },
  WRONG_ANSWER: { label: 'Wrong Answer', tone: 'bad', Icon: X },
  TLE: { label: 'Time Limit Exceeded', tone: 'warn', Icon: Timer },
  RUNTIME_ERROR: { label: 'Runtime Error', tone: 'bad', Icon: TriangleAlert },
  COMPILE_ERROR: { label: 'Compile Error', tone: 'bad', Icon: Braces },
  INTERNAL_ERROR: { label: 'Internal Error', tone: 'bad', Icon: ServerCrash },
  PLAGIARISM_FLAGGED: { label: 'Under review', tone: 'flag', Icon: ShieldAlert },
}

export function VerdictBadge({ verdict }: { verdict: Verdict }) {
  const { label, tone, Icon } = config[verdict]
  return (
    <Badge tone={tone}>
      <Icon className="size-3.5" aria-hidden />
      {label}
    </Badge>
  )
}
