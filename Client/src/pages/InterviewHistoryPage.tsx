import { useState, useEffect } from 'react'
import { Link } from 'react-router'
import { Mic, ArrowRight, Calendar, Sparkles } from 'lucide-react'
import { Button, Badge, DataTable, type Column, EmptyState } from '../components/ui'
import { listInterviews, type InterviewSession } from '../api/interviews'

export default function InterviewHistoryPage() {
  const [sessions, setSessions] = useState<InterviewSession[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalItems, setTotalItems] = useState(0)

  const loadData = async (targetPage: number) => {
    setIsLoading(true)
    try {
      const res = await listInterviews({ page: targetPage, limit: 10 })
      setSessions(res.data || [])
      setPage(res.pagination?.page || 1)
      setTotalPages(res.pagination?.totalPages || 1)
      setTotalItems(res.pagination?.total || (res.data ? res.data.length : 0))
    } catch {
      setSessions([])
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void loadData(page)
  }, [page])

  const columns: Column<InterviewSession & Record<string, unknown>>[] = [
    {
      key: 'startedAt',
      header: 'Date',
      sortable: true,
      render: (row) => (
        <div className="flex items-center gap-2 text-xs font-mono text-muted">
          <Calendar className="size-3.5 opacity-60" />
          <span>{new Date(row.startedAt).toLocaleDateString()}</span>
        </div>
      ),
    },
    {
      key: 'topics',
      header: 'Topics',
      render: (row) => (
        <div className="flex flex-wrap gap-1.5">
          {row.topics.map((t) => (
            <span
              key={t}
              className="rounded-full bg-white/5 border border-white/10 px-2 py-0.5 text-[11px] font-mono text-muted"
            >
              {t}
            </span>
          ))}
        </div>
      ),
    },
    {
      key: 'difficulty',
      header: 'Difficulty',
      sortable: true,
      render: (row) => {
        const tone = row.difficulty === 'Hard' ? 'bad' : row.difficulty === 'Medium' ? 'warn' : 'ok'
        return <Badge tone={tone}>{row.difficulty}</Badge>
      },
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => {
        const tone = row.status === 'completed' ? 'ok' : row.status === 'in_progress' ? 'run' : 'bad'
        return <Badge tone={tone}>{row.status.replace('_', ' ')}</Badge>
      },
    },
    {
      key: 'overallScore',
      header: 'Score',
      align: 'center',
      sortable: true,
      render: (row) => {
        if (row.overallScore === undefined || row.status !== 'completed') {
          return <span className="text-muted/60 text-xs font-mono">-</span>
        }
        const score = row.overallScore
        const tone = score >= 7 ? 'ok' : score >= 5 ? 'warn' : 'bad'
        return (
          <span className="font-mono font-bold text-xs">
            <Badge tone={tone}>{score.toFixed(1)} / 10</Badge>
          </span>
        )
      },
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (row) => {
        const link =
          row.status === 'completed'
            ? `/interview/${row.id}/summary`
            : `/interview/${row.id}`
        return (
          <Link to={link}>
            <Button variant="ghost" size="sm" rightIcon={<ArrowRight className="size-3.5" />}>
              {row.status === 'completed' ? 'View Summary' : 'Resume'}
            </Button>
          </Link>
        )
      },
    },
  ]

  return (
    <div className="flex flex-col gap-8 max-w-5xl mx-auto pb-16">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-6">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-cyan mb-1">
            <Sparkles className="size-3.5" />
            <span>AI Practice History</span>
          </div>
          <h1 className="font-display text-3xl font-bold text-ink">Past Mock Interviews</h1>
          <p className="font-sans text-xs text-muted mt-1">
            Review past feedback, scorecard analyses, and track your interview communication progress.
          </p>
        </div>

        <Link to="/interview">
          <Button variant="primary" leftIcon={<Mic className="size-4" />}>
            New Mock Interview
          </Button>
        </Link>
      </div>

      {/* History Table */}
      <DataTable
        data={sessions as unknown as Array<InterviewSession & Record<string, unknown>>}
        columns={columns}
        isLoading={isLoading}
        keyExtractor={(row) => row.id}
        page={page}
        totalPages={totalPages}
        totalItems={totalItems}
        pageSize={10}
        onPageChange={(p) => setPage(p)}
        emptyState={
          <EmptyState
            icon={Mic}
            heading="No interviews yet"
            description="Take your first AI mock interview to test your CS fundamentals, receive instant scores, and build speaking confidence."
            action={{
              label: 'Start First Interview',
              to: '/interview',
              leftIcon: <Mic className="size-4" />,
            }}
            className="border-none bg-transparent shadow-none"
          />
        }
      />
    </div>
  )
}
