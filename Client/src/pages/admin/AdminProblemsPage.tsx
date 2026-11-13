import { useState, useEffect, useCallback } from 'react'
import { Plus, Edit2, Trash2, Code, FileText, Check, Search } from 'lucide-react'
import {
  Button,
  Badge,
  DataTable,
  Drawer,
  Modal,
  Input,
  useToast,
  type Column,
  EmptyState,
  Tabs,
} from '../../components/ui'
import {
  listAdminProblems,
  createAdminProblem,
  updateAdminProblem,
  deleteAdminProblem,
  getAdminProblem,
  type AdminProblemItem,
  type ProblemDifficulty,
  type SupportedLanguage,
  type TestCaseItem,
} from '../../api/admin'

const ALL_LANGUAGES: SupportedLanguage[] = ['python', 'cpp', 'java', 'javascript']
const DIFFICULTIES: ProblemDifficulty[] = ['Easy', 'Medium', 'Hard']

const defaultStarterCodes: Record<SupportedLanguage, string> = {
  python: 'def solution():\n    # Write your solution here\n    pass\n',
  cpp: '#include <iostream>\nusing namespace std;\n\nint main() {\n    // Write your solution here\n    return 0;\n}\n',
  java: 'public class Solution {\n    public static void main(String[] args) {\n        // Write your solution here\n    }\n}\n',
  javascript: 'function solution() {\n    // Write your solution here\n}\n',
}

export default function AdminProblemsPage() {
  const toast = useToast()

  const [problems, setProblems] = useState<AdminProblemItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalItems, setTotalItems] = useState(0)
  const [search, setSearch] = useState('')

  // Drawer / Form state
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)
  const [editingProblemId, setEditingProblemId] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  // Form fields
  const [formTitle, setFormTitle] = useState('')
  const [formStatement, setFormStatement] = useState('')
  const [formConstraints, setFormConstraints] = useState('')
  const [formDifficulty, setFormDifficulty] = useState<ProblemDifficulty>('Easy')
  const [formLanguages, setFormLanguages] = useState<SupportedLanguage[]>([...ALL_LANGUAGES])
  const [formIsPublished, setFormIsPublished] = useState(true)
  const [formStarterCodes, setFormStarterCodes] = useState<Record<SupportedLanguage, string>>({
    ...defaultStarterCodes,
  })
  const [activeCodeLang, setActiveCodeLang] = useState<string>('python')

  // Test cases editor state
  const [formTestCases, setFormTestCases] = useState<TestCaseItem[]>([
    { input: '', expectedOutput: '', isSample: true, order: 1, explanation: '' },
  ])

  // Delete modal state
  const [deletingProblem, setDeletingProblem] = useState<AdminProblemItem | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  const loadProblems = useCallback(
    async (targetPage = 1, query = search) => {
      setIsLoading(true)
      try {
        const res = await listAdminProblems({
          page: targetPage,
          limit: 10,
          search: query.trim() || undefined,
        })
        setProblems(res.data || [])
        setPage(res.pagination?.page || 1)
        setTotalPages(res.pagination?.totalPages || 1)
        setTotalItems(res.pagination?.total || 0)
      } catch (err) {
        toast.error('Failed to load problems.')
      } finally {
        setIsLoading(false)
      }
    },
    [search, toast],
  )

  useEffect(() => {
    void loadProblems(page)
  }, [page, loadProblems])

  const openCreateDrawer = () => {
    setEditingProblemId(null)
    setFormTitle('')
    setFormStatement('')
    setFormConstraints('')
    setFormDifficulty('Easy')
    setFormLanguages([...ALL_LANGUAGES])
    setFormIsPublished(true)
    setFormStarterCodes({ ...defaultStarterCodes })
    setFormTestCases([
      { input: '', expectedOutput: '', isSample: true, order: 1, explanation: '' },
    ])
    setIsDrawerOpen(true)
  }

  const openEditDrawer = async (problem: AdminProblemItem) => {
    try {
      const fullProblem = await getAdminProblem(problem.id)
      setEditingProblemId(fullProblem.id)
      setFormTitle(fullProblem.title)
      setFormStatement(fullProblem.statement || '')
      setFormConstraints(fullProblem.constraints || '')
      setFormDifficulty(fullProblem.difficulty)
      setFormLanguages(
        fullProblem.supportedLanguages?.length ? fullProblem.supportedLanguages : [...ALL_LANGUAGES],
      )
      setFormIsPublished(fullProblem.isPublished)
      setFormStarterCodes({
        ...defaultStarterCodes,
        ...(fullProblem.starterCode || {}),
      })
      if (fullProblem.testCases && fullProblem.testCases.length > 0) {
        setFormTestCases(fullProblem.testCases)
      } else {
        setFormTestCases([
          { input: '', expectedOutput: '', isSample: true, order: 1, explanation: '' },
        ])
      }
      setIsDrawerOpen(true)
    } catch {
      toast.error('Failed to load problem details.')
    }
  }

  const handleSaveProblem = async () => {
    if (!formTitle.trim()) {
      toast.warn('Problem title is required.')
      return
    }
    if (!formStatement.trim()) {
      toast.warn('Problem statement is required.')
      return
    }

    setIsSaving(true)
    try {
      const payload = {
        title: formTitle.trim(),
        statement: formStatement.trim(),
        constraints: formConstraints.trim() || 'Standard constraints apply.',
        difficulty: formDifficulty,
        supportedLanguages: formLanguages,
        starterCode: formStarterCodes,
        isPublished: formIsPublished,
        testCases: formTestCases.map((tc, idx) => ({
          ...tc,
          order: idx + 1,
        })),
      }

      if (editingProblemId) {
        await updateAdminProblem(editingProblemId, payload)
        toast.success('Problem successfully updated.', 'Updated')
      } else {
        await createAdminProblem(payload)
        toast.success('Problem created successfully.', 'Created')
      }

      setIsDrawerOpen(false)
      void loadProblems(page)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not save problem.'
      toast.error(msg, 'Save Error')
    } finally {
      setIsSaving(false)
    }
  }

  const handleDeleteProblem = async () => {
    if (!deletingProblem) return
    setIsDeleting(true)
    try {
      await deleteAdminProblem(deletingProblem.id)
      toast.success(`Deleted problem: ${deletingProblem.title}`)
      setDeletingProblem(null)
      void loadProblems(page)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to delete problem.'
      toast.error(msg)
    } finally {
      setIsDeleting(false)
    }
  }

  // Test case manipulation
  const addTestCase = () => {
    setFormTestCases((prev) => [
      ...prev,
      {
        input: '',
        expectedOutput: '',
        isSample: false,
        order: prev.length + 1,
        explanation: '',
      },
    ])
  }

  const removeTestCase = (idx: number) => {
    if (formTestCases.length <= 1) {
      toast.warn('Problem requires at least one testcase.')
      return
    }
    setFormTestCases((prev) => prev.filter((_, i) => i !== idx))
  }

  const updateTestCase = (idx: number, updates: Partial<TestCaseItem>) => {
    setFormTestCases((prev) =>
      prev.map((tc, i) => (i === idx ? { ...tc, ...updates } : tc)),
    )
  }

  const columns: Column<AdminProblemItem & Record<string, unknown>>[] = [
    {
      key: 'title',
      header: 'Problem Title',
      sortable: true,
      render: (row) => (
        <div className="space-y-0.5">
          <span className="font-display font-semibold text-ink text-sm block">{row.title}</span>
          {row.slug && <span className="font-mono text-[11px] text-muted">/{row.slug}</span>}
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
      key: 'languages',
      header: 'Supported Languages',
      render: (row) => (
        <div className="flex flex-wrap gap-1">
          {row.supportedLanguages?.map((lang) => (
            <span
              key={lang}
              className="rounded-full bg-white/5 border border-white/10 px-2 py-0.5 text-[10px] font-mono text-muted uppercase"
            >
              {lang}
            </span>
          ))}
        </div>
      ),
    },
    {
      key: 'isPublished',
      header: 'Status',
      sortable: true,
      render: (row) => (
        <Badge tone={row.isPublished ? 'ok' : 'warn'}>
          {row.isPublished ? 'Published' : 'Draft'}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (row) => (
        <div className="flex items-center justify-end gap-2">
          <Button
            variant="ghost"
            size="sm"
            leftIcon={<Edit2 className="size-3.5" />}
            onClick={() => void openEditDrawer(row)}
            aria-label={`Edit ${row.title}`}
          >
            Edit
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-bad hover:bg-bad/10 hover:text-bad"
            leftIcon={<Trash2 className="size-3.5" />}
            onClick={() => setDeletingProblem(row)}
            aria-label={`Delete ${row.title}`}
          >
            Delete
          </Button>
        </div>
      ),
    },
  ]

  return (
    <div className="flex flex-col gap-6">
      {/* Top Header Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="relative w-full max-w-xs">
          <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <input
            type="text"
            placeholder="Search problems by title..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void loadProblems(1, search)}
            className="w-full rounded-full border border-white/10 bg-white/5 py-2 pl-10 pr-4 text-xs font-sans text-ink placeholder-muted focus:border-cyan focus:outline-none focus:ring-1 focus:ring-cyan"
          />
        </div>

        <Button
          variant="primary"
          leftIcon={<Plus className="size-4" />}
          onClick={openCreateDrawer}
        >
          Create Problem
        </Button>
      </div>

      {/* Problems Table */}
      <DataTable
        data={problems as unknown as Array<AdminProblemItem & Record<string, unknown>>}
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
            icon={Code}
            heading="No problems authored yet"
            description="Create your first problem with customized test cases, starter code, and constraints."
            action={{
              label: 'Create Problem',
              onClick: openCreateDrawer,
              leftIcon: <Plus className="size-4" />,
            }}
            className="border-none bg-transparent shadow-none"
          />
        }
      />

      {/* Create / Edit Problem Slide-Over Drawer */}
      <Drawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        width="xl"
        title={editingProblemId ? 'Edit Problem' : 'Create New Problem'}
        description="Configure problem statement, constraints, starter code per language, and test cases."
        footer={
          <>
            <Button variant="ghost" onClick={() => setIsDrawerOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              loading={isSaving}
              leftIcon={<Check className="size-4" />}
              onClick={handleSaveProblem}
            >
              {editingProblemId ? 'Save Changes' : 'Publish Problem'}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-6 py-2">
          {/* Title & Difficulty */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Input
                label="Problem Title"
                placeholder="e.g. Reverse Linked List"
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="font-sans text-xs font-medium text-ink">Difficulty</label>
              <select
                value={formDifficulty}
                onChange={(e) => setFormDifficulty(e.target.value as ProblemDifficulty)}
                className="h-11 rounded-ctl border border-white/10 bg-white/5 px-3 font-sans text-sm text-ink focus:border-cyan focus:outline-none"
              >
                {DIFFICULTIES.map((d) => (
                  <option key={d} value={d} className="bg-base text-ink">
                    {d}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Published Toggle & Languages */}
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-ctl border border-white/10 bg-white/5 p-4">
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="isPublished"
                checked={formIsPublished}
                onChange={(e) => setFormIsPublished(e.target.checked)}
                className="size-4 rounded border-white/20 bg-base text-cyan focus:ring-cyan"
              />
              <label htmlFor="isPublished" className="font-sans text-xs font-medium text-ink cursor-pointer">
                Publish to student catalog immediately
              </label>
            </div>

            <div className="flex items-center gap-2">
              <span className="font-sans text-xs text-muted mr-1">Languages:</span>
              {ALL_LANGUAGES.map((lang) => {
                const isSelected = formLanguages.includes(lang)
                return (
                  <button
                    key={lang}
                    type="button"
                    onClick={() =>
                      setFormLanguages((prev) =>
                        prev.includes(lang) ? prev.filter((l) => l !== lang) : [...prev, lang],
                      )
                    }
                    className={`rounded-full px-2.5 py-1 text-[11px] font-mono uppercase transition-colors ${
                      isSelected
                        ? 'bg-cyan/20 border border-cyan/40 text-cyan'
                        : 'bg-white/5 border border-white/10 text-muted'
                    }`}
                  >
                    {lang}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Statement */}
          <div className="flex flex-col gap-1.5">
            <label className="font-sans text-xs font-medium text-ink">
              Problem Statement (Markdown Supported)
            </label>
            <textarea
              rows={6}
              value={formStatement}
              onChange={(e) => setFormStatement(e.target.value)}
              placeholder="Provide a detailed description of the challenge, input/output requirements, etc."
              className="w-full rounded-ctl border border-white/10 bg-black/30 p-3 font-sans text-xs text-ink placeholder-muted focus:border-cyan focus:outline-none focus:ring-1 focus:ring-cyan resize-y"
            />
          </div>

          {/* Constraints */}
          <div className="flex flex-col gap-1.5">
            <label className="font-sans text-xs font-medium text-ink">Constraints</label>
            <textarea
              rows={2}
              value={formConstraints}
              onChange={(e) => setFormConstraints(e.target.value)}
              placeholder="e.g. 1 <= n <= 10^5, time limit 1000ms"
              className="w-full rounded-ctl border border-white/10 bg-black/30 p-3 font-sans text-xs text-ink placeholder-muted focus:border-cyan focus:outline-none focus:ring-1 focus:ring-cyan"
            />
          </div>

          {/* Starter Code Editor Per Language */}
          <div className="flex flex-col gap-2 rounded-ctl border border-white/10 bg-white/5 p-4">
            <div className="flex items-center justify-between pb-2 border-b border-white/10">
              <span className="font-display text-xs font-semibold text-ink">
                Starter Code Editor
              </span>
              <Tabs
                tabs={ALL_LANGUAGES.map((l) => ({ id: l, label: l.toUpperCase() }))}
                activeId={activeCodeLang}
                onChange={setActiveCodeLang}
                size="sm"
                layoutId="admin-code-lang"
              />
            </div>
            <textarea
              rows={6}
              value={formStarterCodes[activeCodeLang as SupportedLanguage] || ''}
              onChange={(e) =>
                setFormStarterCodes((prev) => ({
                  ...prev,
                  [activeCodeLang as SupportedLanguage]: e.target.value,
                }))
              }
              className="w-full font-mono text-xs text-ink bg-black/50 border border-white/10 rounded-ctl p-3 focus:border-cyan focus:outline-none resize-y"
            />
          </div>

          {/* Interactive Test Cases Sub-Editor */}
          <div className="flex flex-col gap-3 rounded-ctl border border-white/10 bg-white/5 p-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <FileText className="size-4 text-cyan" />
                <span className="font-display text-sm font-semibold text-ink">
                  Test Cases Suite ({formTestCases.length})
                </span>
              </div>
              <Button
                variant="secondary"
                size="sm"
                leftIcon={<Plus className="size-3.5" />}
                onClick={addTestCase}
              >
                Add Test Case
              </Button>
            </div>

            <div className="flex flex-col gap-3">
              {formTestCases.map((tc, idx) => (
                <div
                  key={idx}
                  className="rounded-ctl border border-white/10 bg-black/20 p-3.5 flex flex-col gap-3"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-xs font-bold text-muted">#{idx + 1}</span>
                      <label className="flex items-center gap-2 text-xs font-sans text-ink cursor-pointer">
                        <input
                          type="checkbox"
                          checked={tc.isSample}
                          onChange={(e) => updateTestCase(idx, { isSample: e.target.checked })}
                          className="size-3.5 rounded border-white/20 bg-base text-cyan"
                        />
                        <span>Is Sample (Visible to students in description)</span>
                      </label>
                    </div>
                    {formTestCases.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeTestCase(idx)}
                        className="text-bad hover:underline text-xs font-sans"
                      >
                        Remove
                      </button>
                    )}
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <span className="font-mono text-[11px] text-muted block mb-1">Standard Input</span>
                      <textarea
                        rows={2}
                        value={tc.input}
                        onChange={(e) => updateTestCase(idx, { input: e.target.value })}
                        placeholder="e.g. 5\n1 2 3 4 5"
                        className="w-full font-mono text-xs text-ink bg-black/40 border border-white/10 rounded-ctl p-2 focus:border-cyan focus:outline-none"
                      />
                    </div>
                    <div>
                      <span className="font-mono text-[11px] text-muted block mb-1">Expected Output</span>
                      <textarea
                        rows={2}
                        value={tc.expectedOutput}
                        onChange={(e) => updateTestCase(idx, { expectedOutput: e.target.value })}
                        placeholder="e.g. 15"
                        className="w-full font-mono text-xs text-ink bg-black/40 border border-white/10 rounded-ctl p-2 focus:border-cyan focus:outline-none"
                      />
                    </div>
                  </div>

                  {tc.isSample && (
                    <div>
                      <span className="font-sans text-[11px] text-muted block mb-1">
                        Explanation (Optional)
                      </span>
                      <input
                        type="text"
                        value={tc.explanation || ''}
                        onChange={(e) => updateTestCase(idx, { explanation: e.target.value })}
                        placeholder="Explain the sample transformation..."
                        className="w-full font-sans text-xs text-ink bg-black/40 border border-white/10 rounded-ctl px-3 py-1.5 focus:border-cyan focus:outline-none"
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </Drawer>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={Boolean(deletingProblem)}
        onClose={() => setDeletingProblem(null)}
        title="Delete Problem?"
        description={`Are you sure you want to delete "${deletingProblem?.title}"? This will permanently delete the problem and its associated test cases.`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeletingProblem(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              className="bg-bad hover:bg-bad/90"
              loading={isDeleting}
              onClick={handleDeleteProblem}
            >
              Confirm Delete
            </Button>
          </>
        }
      >
        <p className="font-sans text-xs text-muted">
          Existing submissions associated with this problem may be archived or cascaded per transaction rules.
        </p>
      </Modal>
    </div>
  )
}
