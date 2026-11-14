import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router'
import {
  Plus,
  Play,
  Square,
  RefreshCw,
  Trophy,
  Calendar,
  Eye,
  Check,
} from 'lucide-react'
import {
  Button,
  Badge,
  DataTable,
  Drawer,
  Input,
  useToast,
  type Column,
  EmptyState,
} from '../../components/ui'
import {
  listAdminContests,
  createAdminContest,
  startAdminContest,
  endAdminContest,
  rebuildAdminLeaderboard,
  listAdminProblems,
  type AdminContestItem,
  type AdminProblemItem,
} from '../../api/admin'

export default function AdminContestsPage() {
  const toast = useToast()

  const [contests, setContests] = useState<AdminContestItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalItems, setTotalItems] = useState(0)

  // Drawer state
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [availableProblems, setAvailableProblems] = useState<AdminProblemItem[]>([])

  // Form fields
  const [formTitle, setFormTitle] = useState('')
  const [formDescription, setFormDescription] = useState('')
  const [formStartTime, setFormStartTime] = useState('')
  const [formEndTime, setFormEndTime] = useState('')
  const [selectedProblems, setSelectedProblems] = useState<
    Array<{ problemId: string; points: number }>
  >([])

  // Action busy states
  const [busyActionId, setBusyActionId] = useState<string | null>(null)

  const loadContests = useCallback(
    async (targetPage = 1) => {
      setIsLoading(true)
      try {
        const res = await listAdminContests({ page: targetPage, limit: 10 })
        setContests(res.data || [])
        setPage(res.pagination?.page || 1)
        setTotalPages(res.pagination?.totalPages || 1)
        setTotalItems(res.pagination?.total || 0)
      } catch {
        toast.error('Failed to load contests.')
      } finally {
        setIsLoading(false)
      }
    },
    [toast],
  )

  useEffect(() => {
    const run = async () => {
      await loadContests(page)
    }
    void run()
  }, [page, loadContests])

  const openCreateDrawer = async () => {
    setFormTitle('')
    setFormDescription('')
    const now = new Date()
    const inOneHour = new Date(now.getTime() + 60 * 60 * 1000)
    const inThreeHours = new Date(now.getTime() + 3 * 60 * 60 * 1000)

    setFormStartTime(inOneHour.toISOString().slice(0, 16))
    setFormEndTime(inThreeHours.toISOString().slice(0, 16))
    setSelectedProblems([])
    setIsDrawerOpen(true)

    try {
      const pRes = await listAdminProblems({ limit: 50, isPublished: true })
      setAvailableProblems(pRes.data || [])
    } catch {
      setAvailableProblems([])
    }
  }

  const toggleProblemSelection = (pId: string) => {
    setSelectedProblems((prev) => {
      const exists = prev.find((item) => item.problemId === pId)
      if (exists) {
        return prev.filter((item) => item.problemId !== pId)
      }
      return [...prev, { problemId: pId, points: 100 }]
    })
  }

  const updateProblemPoints = (pId: string, pts: number) => {
    setSelectedProblems((prev) =>
      prev.map((item) => (item.problemId === pId ? { ...item, points: pts } : item)),
    )
  }

  const handleCreateContest = async () => {
    if (!formTitle.trim()) {
      toast.warn('Contest title is required.')
      return
    }
    if (!formStartTime || !formEndTime) {
      toast.warn('Please provide start and end times.')
      return
    }
    if (new Date(formStartTime) >= new Date(formEndTime)) {
      toast.warn('End time must be strictly after start time.')
      return
    }
    if (selectedProblems.length === 0) {
      toast.warn('Select at least one problem for this contest.')
      return
    }

    setIsSaving(true)
    try {
      await createAdminContest({
        title: formTitle.trim(),
        description: formDescription.trim(),
        startTime: new Date(formStartTime).toISOString(),
        endTime: new Date(formEndTime).toISOString(),
        problems: selectedProblems.map((p) => ({
          problem: p.problemId,
          points: p.points,
        })),
      })

      toast.success('Contest created successfully.', 'Created')
      setIsDrawerOpen(false)
      void loadContests(page)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not create contest.'
      toast.error(msg, 'Contest Error')
    } finally {
      setIsSaving(false)
    }
  }

  const handleStartContest = async (id: string) => {
    setBusyActionId(id)
    try {
      await startAdminContest(id)
      toast.success('Contest status changed to LIVE!')
      void loadContests(page)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to start contest.'
      toast.error(msg)
    } finally {
      setBusyActionId(null)
    }
  }

  const handleEndContest = async (id: string) => {
    setBusyActionId(id)
    try {
      await endAdminContest(id)
      toast.success('Contest marked as ENDED.')
      void loadContests(page)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to end contest.'
      toast.error(msg)
    } finally {
      setBusyActionId(null)
    }
  }

  const handleRebuildLeaderboard = async (id: string) => {
    setBusyActionId(id)
    try {
      await rebuildAdminLeaderboard(id)
      toast.success('Leaderboard successfully rebuilt in Redis from Mongo submissions.')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to rebuild leaderboard.'
      toast.error(msg)
    } finally {
      setBusyActionId(null)
    }
  }

  const columns: Column<AdminContestItem & Record<string, unknown>>[] = [
    {
      key: 'title',
      header: 'Contest',
      sortable: true,
      render: (row) => (
        <div className="space-y-0.5">
          <span className="font-display font-semibold text-ink text-sm block">{row.title}</span>
          <span className="font-sans text-xs text-muted line-clamp-1">{row.description}</span>
        </div>
      ),
    },
    {
      key: 'schedule',
      header: 'Schedule',
      render: (row) => (
        <div className="space-y-1 text-xs font-mono text-muted">
          <div className="flex items-center gap-1.5">
            <Calendar className="size-3 text-cyan" />
            <span>{new Date(row.startTime).toLocaleString()}</span>
          </div>
          <span className="text-[11px] text-muted/60 pl-4.5 block">
            to {new Date(row.endTime).toLocaleString()}
          </span>
        </div>
      ),
    },
    {
      key: 'problems',
      header: 'Problems',
      render: (row) => (
        <span className="font-mono text-xs text-ink font-semibold">
          {row.problems?.length ?? 0} problems
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      render: (row) => {
        const tone = row.status === 'live' ? 'ok' : row.status === 'draft' ? 'warn' : 'run'
        return <Badge tone={tone}>{row.status.toUpperCase()}</Badge>
      },
    },
    {
      key: 'actions',
      header: 'Lifecycle & Controls',
      align: 'right',
      render: (row) => {
        const isBusy = busyActionId === row.id
        return (
          <div className="flex flex-wrap items-center justify-end gap-2">
            {row.status === 'draft' && (
              <Button
                variant="primary"
                size="sm"
                loading={isBusy}
                leftIcon={<Play className="size-3.5" />}
                onClick={() => void handleStartContest(row.id)}
              >
                Start Contest
              </Button>
            )}

            {row.status === 'live' && (
              <Button
                variant="secondary"
                size="sm"
                className="text-bad hover:bg-bad/10 hover:text-bad"
                loading={isBusy}
                leftIcon={<Square className="size-3.5" />}
                onClick={() => void handleEndContest(row.id)}
              >
                End Contest
              </Button>
            )}

            {row.status !== 'draft' && (
              <Button
                variant="ghost"
                size="sm"
                loading={isBusy}
                leftIcon={<RefreshCw className="size-3.5" />}
                onClick={() => void handleRebuildLeaderboard(row.id)}
                title="Rebuild Redis Leaderboard"
              >
                Rebuild
              </Button>
            )}

            <Link to={`/admin/contests/${row.id}/live`}>
              <Button variant="ghost" size="sm" leftIcon={<Eye className="size-3.5" />}>
                Live Monitor
              </Button>
            </Link>
          </div>
        )
      },
    },
  ]

  return (
    <div className="flex flex-col gap-6">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-xl font-bold text-ink">Contests Management</h2>
          <p className="font-sans text-xs text-muted">
            Configure time windows, point weightings, and real-time state machine triggers.
          </p>
        </div>

        <Button
          variant="primary"
          leftIcon={<Plus className="size-4" />}
          onClick={openCreateDrawer}
        >
          Create Contest
        </Button>
      </div>

      {/* Contests Table */}
      <DataTable
        data={contests as unknown as Array<AdminContestItem & Record<string, unknown>>}
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
            icon={Trophy}
            heading="No contests created yet"
            description="Create your first coding competition, select problems, and invite participants."
            action={{
              label: 'Create Contest',
              onClick: openCreateDrawer,
              leftIcon: <Plus className="size-4" />,
            }}
            className="border-none bg-transparent shadow-none"
          />
        }
      />

      {/* Create Contest Drawer */}
      <Drawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        width="lg"
        title="Create New Contest"
        description="Set contest duration, choose problems, and assign point weightings."
        footer={
          <>
            <Button variant="ghost" onClick={() => setIsDrawerOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              loading={isSaving}
              leftIcon={<Check className="size-4" />}
              onClick={handleCreateContest}
            >
              Save Draft Contest
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-6 py-2">
          <Input
            label="Contest Title"
            placeholder="e.g. Weekly Algorithm Arena #42"
            value={formTitle}
            onChange={(e) => setFormTitle(e.target.value)}
          />

          <div className="flex flex-col gap-1.5">
            <label className="font-sans text-xs font-medium text-ink">Description</label>
            <textarea
              rows={3}
              value={formDescription}
              onChange={(e) => setFormDescription(e.target.value)}
              placeholder="Rules, scoring strategy, and penalties..."
              className="w-full rounded-ctl border border-white/10 bg-black/30 p-3 font-sans text-xs text-ink placeholder-muted focus:border-cyan focus:outline-none"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label className="font-sans text-xs font-medium text-ink">Start Time</label>
              <input
                type="datetime-local"
                value={formStartTime}
                onChange={(e) => setFormStartTime(e.target.value)}
                className="h-11 rounded-ctl border border-white/10 bg-white/5 px-3 font-mono text-xs text-ink focus:border-cyan focus:outline-none"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="font-sans text-xs font-medium text-ink">End Time</label>
              <input
                type="datetime-local"
                value={formEndTime}
                onChange={(e) => setFormEndTime(e.target.value)}
                className="h-11 rounded-ctl border border-white/10 bg-white/5 px-3 font-mono text-xs text-ink focus:border-cyan focus:outline-none"
              />
            </div>
          </div>

          {/* Problem Selector with Points */}
          <div className="flex flex-col gap-3 rounded-ctl border border-white/10 bg-white/5 p-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-2">
              <span className="font-display text-sm font-semibold text-ink">
                Select Contest Problems ({selectedProblems.length})
              </span>
              <span className="font-mono text-xs text-muted">
                Total:{' '}
                {selectedProblems.reduce((sum, item) => sum + item.points, 0)}{' '}
                pts
              </span>
            </div>

            <div className="max-h-60 overflow-y-auto divide-y divide-white/5 pr-1">
              {availableProblems.length === 0 ? (
                <p className="py-4 text-center font-sans text-xs text-muted">
                  No published problems found. Publish problems in Problems Manager first.
                </p>
              ) : (
                availableProblems.map((prob) => {
                  const entry = selectedProblems.find((p) => p.problemId === prob.id)
                  const isSelected = Boolean(entry)

                  return (
                    <div
                      key={prob.id}
                      className="flex items-center justify-between py-2.5 gap-4"
                    >
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleProblemSelection(prob.id)}
                          className="size-4 rounded border-white/20 bg-base text-cyan"
                        />
                        <div>
                          <span className="font-sans text-xs font-semibold text-ink block">
                            {prob.title}
                          </span>
                          <span className="font-mono text-[10px] text-muted">{prob.difficulty}</span>
                        </div>
                      </div>

                      {isSelected && (
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[11px] text-muted">Points:</span>
                          <input
                            type="number"
                            min="10"
                            max="2000"
                            step="50"
                            value={entry?.points ?? 100}
                            onChange={(e) =>
                              updateProblemPoints(prob.id, parseInt(e.target.value, 10) || 100)
                            }
                            className="w-20 rounded-ctl border border-white/10 bg-black/40 px-2 py-1 font-mono text-xs text-ink focus:border-cyan focus:outline-none"
                          />
                        </div>
                      )}
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>
      </Drawer>
    </div>
  )
}
