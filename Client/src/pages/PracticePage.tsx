import { useState, useEffect, useTransition } from 'react'
import { Link } from 'react-router'
import { Search, ChevronLeft, ChevronRight, Terminal, Loader2, Hash, AlertCircle, RefreshCw } from 'lucide-react'
import { Badge, Chip, GlassCard, Button } from '../components/ui'
import { useAuthStore } from '../store/authStore'
import type { Difficulty } from '../features/practice/problems'
import { getProblems, type ProblemSummary, type Pagination } from '../api/problems'

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
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [limit] = useState(10)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [, startTransition] = useTransition()

  const [problems, setProblems] = useState<ProblemSummary[]>([])
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 1,
  })

  useEffect(() => {
    let isCancelled = false

    const loadProblems = async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await getProblems({ page, limit, search, difficulty: filter })
        if (isCancelled) return

        if (!Array.isArray(res?.data)) {
          throw new Error('The problems API returned an unexpected response.')
        }

        setProblems(res.data)
        if (res.pagination) {
          setPagination(res.pagination)
        } else {
          setPagination({
            page,
            limit,
            total: res.data.length,
            totalPages: Math.max(1, Math.ceil(res.data.length / limit)),
          })
        }
      } catch (err: unknown) {
        if (isCancelled) return
        setProblems([])
        setError(
          err instanceof Error
            ? err.message
            : 'Could not load problems. Please try again.'
        )
      } finally {
        if (!isCancelled) setLoading(false)
      }
    }

    void loadProblems()

    return () => {
      isCancelled = true
    }
  }, [page, limit, search, filter, reloadKey])

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    startTransition(() => {
      setSearch(val)
      setPage(1)
    })
  }

  const handleFilterChange = (f: 'All' | Difficulty) => {
    setFilter(f)
    setPage(1)
  }

  return (
    <div className="flex flex-col gap-8 sm:gap-10">
      {/* Header section */}
      <section className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-ctl bg-white/5 border border-white/10 text-cyan shrink-0">
            <Terminal className="size-5" />
          </div>
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">Problem Catalog</h1>
            <p className="text-xs sm:text-sm text-muted mt-0.5">
              {user ? `Welcome back, ${user.name}. ` : ''}Pick a challenge and solve in Python, C++, Java, or JavaScript.
            </p>
          </div>
        </div>

        <ul className="flex flex-wrap gap-2 pt-1" aria-label="Supported languages">
          {languages.map((l) => (
            <li key={l}>
              <Badge className="font-mono text-xs">{l}</Badge>
            </li>
          ))}
        </ul>
      </section>

      {/* Progress Cards */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4" aria-label="Your progress">
        {stats.map((s) => (
          <GlassCard key={s.label} className="flex flex-col gap-1 p-4 sm:p-5">
            <span className="font-mono text-2xl sm:text-3xl font-bold">{s.value}</span>
            <span className="text-xs sm:text-sm text-muted">{s.label}</span>
          </GlassCard>
        ))}
      </section>

      {/* Search & Filters */}
      <section className="flex flex-col gap-6" aria-labelledby="problems-title">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="relative w-full max-w-md">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 flex size-5 -translate-y-1/2 items-center justify-center text-cyan/80" />
            <input
              type="search"
              placeholder="Search by serial (#1), or title..."
              value={search}
              onChange={handleSearchChange}
              aria-label="Search problems"
              className="h-11 w-full rounded-ctl border border-line bg-surface-soft pl-11 pr-4 text-sm text-ink placeholder:text-muted/70 transition-colors duration-200 hover:border-cyan/40 focus-visible:border-cyan/70 focus-visible:ring-2 focus-visible:ring-cyan/20 focus-visible:ring-offset-0"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter by difficulty">
            {filters.map((f) => (
              <Chip
                key={f}
                selected={filter === f}
                onClick={() => handleFilterChange(f)}
              >
                {f}
              </Chip>
            ))}
          </div>
        </div>

        {/* Problems List */}
        {loading ? (
          <div className="flex h-48 flex-col items-center justify-center gap-3 text-muted">
            <Loader2 className="size-6 animate-spin text-cyan" />
            <p className="text-sm font-mono">Loading problem catalog...</p>
          </div>
        ) : error ? (
          <GlassCard className="flex flex-col items-center justify-center gap-3 border-bad/30 bg-bad/5 py-12 text-center">
            <AlertCircle className="size-9 text-bad" />
            <div>
              <p className="text-lg font-semibold text-ink">Could not load problems</p>
              <p className="mt-1 text-sm text-muted">{error}</p>
            </div>
            <Button
              variant="secondary"
              size="sm"
              leftIcon={<RefreshCw className="size-4" />}
              onClick={() => setReloadKey((key) => key + 1)}
            >
              Retry
            </Button>
          </GlassCard>
        ) : problems.length === 0 ? (
          <GlassCard className="flex flex-col items-center justify-center py-12 text-center text-muted">
            <Hash className="size-10 text-muted/40 mb-2" />
            <p className="text-lg font-semibold text-ink">No problems match your query</p>
            <p className="text-sm mt-1">Try searching by serial number like #1, #2, or adjusting keywords.</p>
          </GlassCard>
        ) : (
          <ul className="flex flex-col gap-3">
            {problems.map((p) => {
              const displaySerial = p.serialNo
              return (
                <li key={p.id}>
                  <Link to={`/problems/${p.id}`} className="group block focus-visible:outline-none">
                    <GlassCard className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 sm:px-6 sm:py-4 transition-all duration-200 hover:border-cyan/40 hover:bg-white/[0.07] group-hover:shadow-[0_0_20px_rgba(6,182,212,0.15)]">
                      <div className="flex items-center gap-3 sm:gap-4">
                        <span className="flex items-center justify-center min-w-[2.25rem] sm:min-w-[2.5rem] h-7 sm:h-8 rounded-md bg-cyan/10 border border-cyan/30 text-xs font-mono font-bold text-cyan shadow-sm shrink-0">
                          #{displaySerial ?? '—'}
                        </span>
                        <div className="flex min-w-0 flex-col gap-0.5">
                          <span className="break-words text-base sm:text-lg font-semibold text-ink group-hover:text-cyan transition-colors">
                            {p.title}
                          </span>
                          {p.topic && (
                            <span className="text-xs text-muted font-mono">{p.topic}</span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center justify-between sm:justify-end gap-3 sm:gap-5 border-t border-white/5 sm:border-t-0 pt-2.5 sm:pt-0">
                        {p.acceptance !== undefined && (
                          <span className="font-mono text-xs sm:text-sm text-muted">
                            {p.acceptance}% acceptance
                          </span>
                        )}
                        <Badge tone={tone[p.difficulty]}>{p.difficulty}</Badge>
                        <ChevronRight className="size-4 text-muted/60 transition-transform group-hover:translate-x-1 group-hover:text-cyan shrink-0" />
                      </div>
                    </GlassCard>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}

        {/* Pagination Controls */}
        {pagination.totalPages > 1 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-white/10 pt-4">
            <span className="text-xs text-muted font-mono">
              Page {pagination.page} of {pagination.totalPages} ({pagination.total} problems)
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                disabled={pagination.page <= 1 || loading}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                aria-label="Previous page"
              >
                <ChevronLeft className="size-4 mr-1" />
                Previous
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={pagination.page >= pagination.totalPages || loading}
                onClick={() => setPage((p) => p + 1)}
                aria-label="Next page"
              >
                Next
                <ChevronRight className="size-4 ml-1" />
              </Button>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
