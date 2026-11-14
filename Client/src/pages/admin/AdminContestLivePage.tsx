import { useState, useEffect, useCallback } from 'react'
import { useParams, Link } from 'react-router'
import {
  ArrowLeft,
  ShieldAlert,
  Users,
  Send,
  UserX,
  RefreshCw,
  Percent,
} from 'lucide-react'
import {
  Button,
  Badge,
  GlassCard,
  Tabs,
  Modal,
  VerdictBadge,
  useToast,
  EmptyState,
} from '../../components/ui'
import {
  getAdminContest,
  getFlaggedSubmissions,
  getAdminContestSubmissions,
  getAdminContestParticipants,
  disqualifyParticipant,
  type AdminContestItem,
  type FlaggedSubmissionItem,
} from '../../api/admin'
import type { Verdict } from '../../types/verdict'

export default function AdminContestLivePage() {
  const { id: contestId } = useParams<{ id: string }>()
  const toast = useToast()

  const [contest, setContest] = useState<AdminContestItem | null>(null)
  const [activeTab, setActiveTab] = useState<'submissions' | 'participants' | 'plagiarism'>('submissions')
  const [isLoading, setIsLoading] = useState(true)

  // Data lists
  const [submissions, setSubmissions] = useState<Record<string, unknown>[]>([])
  const [participants, setParticipants] = useState<Record<string, unknown>[]>([])
  const [flaggedList, setFlaggedList] = useState<FlaggedSubmissionItem[]>([])

  // Disqualification Modal
  const [disqualifyingUser, setDisqualifyingUser] = useState<{ id: string; name: string } | null>(null)
  const [isDisqualifying, setIsDisqualifying] = useState(false)

  // Selected diff comparison
  const [inspectedDiff, setInspectedDiff] = useState<FlaggedSubmissionItem | null>(null)

  const loadData = useCallback(async () => {
    if (!contestId) return
    setIsLoading(true)
    try {
      const [contestData, subRes, partRes, flagRes] = await Promise.allSettled([
        getAdminContest(contestId),
        getAdminContestSubmissions(contestId, { limit: 50 }),
        getAdminContestParticipants(contestId, { limit: 50 }),
        getFlaggedSubmissions(contestId),
      ])

      if (contestData.status === 'fulfilled') setContest(contestData.value)
      if (subRes.status === 'fulfilled') setSubmissions(subRes.value.data || [])
      if (partRes.status === 'fulfilled') setParticipants(partRes.value.data || [])
      if (flagRes.status === 'fulfilled') setFlaggedList(flagRes.value || [])
    } catch {
      toast.error('Failed to load contest live monitor data.')
    } finally {
      setIsLoading(false)
    }
  }, [contestId, toast])

  useEffect(() => {
    const run = async () => {
      await loadData()
    }
    void run()
  }, [loadData])

  const handleConfirmDisqualify = async () => {
    if (!contestId || !disqualifyingUser) return
    setIsDisqualifying(true)
    try {
      await disqualifyParticipant(contestId, disqualifyingUser.id)
      toast.success(`Participant ${disqualifyingUser.name} has been disqualified.`)
      setDisqualifyingUser(null)
      void loadData()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Disqualification failed.'
      toast.error(msg)
    } finally {
      setIsDisqualifying(false)
    }
  }

  return (
    <div className="flex flex-col gap-8 pb-16">
      {/* Top Banner */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-4">
        <div className="flex items-center gap-4">
          <Link to="/admin/contests">
            <Button variant="ghost" size="sm" leftIcon={<ArrowLeft className="size-4" />}>
              Contests
            </Button>
          </Link>
          <div className="space-y-0.5">
            <div className="flex items-center gap-2.5">
              <h2 className="font-display text-xl sm:text-2xl font-bold text-ink">
                {contest?.title || 'Contest Live Monitor'}
              </h2>
              {contest && (
                <Badge tone={contest.status === 'live' ? 'ok' : 'warn'}>
                  {contest.status.toUpperCase()}
                </Badge>
              )}
            </div>
            <p className="font-sans text-xs text-muted">
              Live audit stream: real-time submissions feed, participant standings, and AST plagiarism detection.
            </p>
          </div>
        </div>

        <Button
          variant="secondary"
          size="sm"
          leftIcon={<RefreshCw className={`size-3.5 ${isLoading ? 'animate-spin' : ''}`} />}
          onClick={() => void loadData()}
        >
          Refresh Data
        </Button>
      </div>

      {/* Tab Switcher */}
      <Tabs
        tabs={[
          {
            id: 'submissions',
            label: 'Live Submissions Feed',
            icon: Send,
            badge: submissions.length,
          },
          {
            id: 'participants',
            label: 'Participants List',
            icon: Users,
            badge: participants.length,
          },
          {
            id: 'plagiarism',
            label: 'Flagged Plagiarism',
            icon: ShieldAlert,
            badge: flaggedList.length,
          },
        ]}
        activeId={activeTab}
        onChange={(id) => setActiveTab(id as typeof activeTab)}
        layoutId="admin-live-tabs"
      />

      {/* Tab 1: Live Submissions Feed */}
      {activeTab === 'submissions' && (
        <GlassCard className="p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left font-sans text-xs">
              <thead>
                <tr className="border-b border-white/10 bg-white/[0.03]">
                  <th className="px-5 py-3 font-mono uppercase text-muted">User</th>
                  <th className="px-5 py-3 font-mono uppercase text-muted">Problem</th>
                  <th className="px-5 py-3 font-mono uppercase text-muted">Language</th>
                  <th className="px-5 py-3 font-mono uppercase text-muted">Verdict</th>
                  <th className="px-5 py-3 font-mono uppercase text-muted">Runtime</th>
                  <th className="px-5 py-3 font-mono uppercase text-muted text-right">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {submissions.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-5 py-8 text-center text-muted">
                      No submissions received for this contest yet.
                    </td>
                  </tr>
                ) : (
                  submissions.map((sub, idx) => {
                    const userObj = sub.user as { name?: string; email?: string } | undefined
                    const problemObj = sub.problem as { title?: string } | undefined
                    return (
                      <tr key={String(sub.id || idx)} className="hover:bg-white/[0.02]">
                        <td className="px-5 py-3 text-ink font-medium">
                          {userObj?.name || userObj?.email || String(sub.user || 'Participant')}
                        </td>
                        <td className="px-5 py-3 text-muted">
                          {problemObj?.title || String(sub.problem || 'Problem')}
                        </td>
                        <td className="px-5 py-3 font-mono uppercase text-muted">
                          {String(sub.language || 'code')}
                        </td>
                        <td className="px-5 py-3">
                          <VerdictBadge verdict={(sub.verdict as Verdict) || 'PENDING'} />
                        </td>
                        <td className="px-5 py-3 font-mono text-muted">
                          {sub.runtime !== undefined ? `${sub.runtime}ms` : '-'}
                        </td>
                        <td className="px-5 py-3 font-mono text-muted text-right">
                          {sub.createdAt ? new Date(String(sub.createdAt)).toLocaleTimeString() : '-'}
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </GlassCard>
      )}

      {/* Tab 2: Participants List */}
      {activeTab === 'participants' && (
        <GlassCard className="p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left font-sans text-xs">
              <thead>
                <tr className="border-b border-white/10 bg-white/[0.03]">
                  <th className="px-5 py-3 font-mono uppercase text-muted">Participant</th>
                  <th className="px-5 py-3 font-mono uppercase text-muted">Email</th>
                  <th className="px-5 py-3 font-mono uppercase text-muted">Status</th>
                  <th className="px-5 py-3 font-mono uppercase text-muted">Current Score</th>
                  <th className="px-5 py-3 font-mono uppercase text-muted text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {participants.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-8 text-center text-muted">
                      No registered participants found.
                    </td>
                  </tr>
                ) : (
                  participants.map((p, idx) => {
                    const userObj = p.user as { id?: string; name?: string; email?: string } | undefined
                    const userId = userObj?.id || String(p.user || '')
                    const isDisqualified = p.isDisqualified === true

                    return (
                      <tr key={String(p.id || idx)} className="hover:bg-white/[0.02]">
                        <td className="px-5 py-3 text-ink font-semibold">
                          {userObj?.name || 'Candidate'}
                        </td>
                        <td className="px-5 py-3 font-mono text-muted">{userObj?.email || '-'}</td>
                        <td className="px-5 py-3">
                          <Badge tone={isDisqualified ? 'bad' : 'ok'}>
                            {isDisqualified ? 'Disqualified' : 'Active'}
                          </Badge>
                        </td>
                        <td className="px-5 py-3 font-mono font-bold text-ink">
                          {String(p.score ?? 0)} pts
                        </td>
                        <td className="px-5 py-3 text-right">
                          {!isDisqualified ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-bad hover:bg-bad/10 hover:text-bad"
                              leftIcon={<UserX className="size-3.5" />}
                              onClick={() =>
                                setDisqualifyingUser({
                                  id: userId,
                                  name: userObj?.name || 'Participant',
                                })
                              }
                            >
                              Disqualify
                            </Button>
                          ) : (
                            <span className="font-mono text-[11px] text-bad">Banned</span>
                          )}
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </GlassCard>
      )}

      {/* Tab 3: Flagged Plagiarism Submissions */}
      {activeTab === 'plagiarism' && (
        <div className="flex flex-col gap-6">
          {flaggedList.length === 0 ? (
            <EmptyState
              icon={ShieldAlert}
              heading="Zero Plagiarism Flags"
              description="Our AST tokenizer and Winnowing fingerprinting service detected no abnormal code similarities for this contest."
              className="p-12"
            />
          ) : (
            <div className="flex flex-col gap-4">
              {flaggedList.map((item) => (
                <GlassCard key={item.id} strong className="p-6 flex flex-col gap-4">
                  <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-3">
                    <div className="flex items-center gap-3">
                      <div className="grid size-10 place-items-center rounded-full bg-bad/10 text-bad border border-bad/30">
                        <Percent className="size-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-display font-bold text-ink">
                            {item.similarity}% Similarity Detected
                          </span>
                          <Badge tone="bad">AST Match</Badge>
                        </div>
                        <span className="font-mono text-xs text-muted">
                          Detected on {new Date(item.detectedAt).toLocaleString()}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setInspectedDiff(item)}
                      >
                        Compare Code Diff
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-bad hover:bg-bad/10 hover:text-bad"
                        leftIcon={<UserX className="size-3.5" />}
                        onClick={() =>
                          setDisqualifyingUser({
                            id: item.submissionA.user.id,
                            name: item.submissionA.user.name,
                          })
                        }
                      >
                        Disqualify Candidate A
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-bad hover:bg-bad/10 hover:text-bad"
                        leftIcon={<UserX className="size-3.5" />}
                        onClick={() =>
                          setDisqualifyingUser({
                            id: item.submissionB.user.id,
                            name: item.submissionB.user.name,
                          })
                        }
                      >
                        Disqualify Candidate B
                      </Button>
                    </div>
                  </div>

                  {/* Candidate metadata row */}
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div className="rounded-ctl bg-white/5 border border-white/10 p-3">
                      <span className="font-mono text-[11px] text-cyan block mb-1">Candidate A</span>
                      <span className="font-sans text-xs font-semibold text-ink block">
                        {item.submissionA.user.name} ({item.submissionA.user.email})
                      </span>
                      <span className="font-mono text-[10px] text-muted">
                        Submission ID: {item.submissionA.id}
                      </span>
                    </div>

                    <div className="rounded-ctl bg-white/5 border border-white/10 p-3">
                      <span className="font-mono text-[11px] text-pink block mb-1">Candidate B</span>
                      <span className="font-sans text-xs font-semibold text-ink block">
                        {item.submissionB.user.name} ({item.submissionB.user.email})
                      </span>
                      <span className="font-mono text-[10px] text-muted">
                        Submission ID: {item.submissionB.id}
                      </span>
                    </div>
                  </div>
                </GlassCard>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Code Comparison Modal */}
      <Modal
        isOpen={Boolean(inspectedDiff)}
        onClose={() => setInspectedDiff(null)}
        size="full"
        title="Side-by-Side AST Plagiarism Comparison"
        description={`Similarity: ${inspectedDiff?.similarity}% detected between ${inspectedDiff?.submissionA.user.name} and ${inspectedDiff?.submissionB.user.name}`}
        footer={
          <Button variant="ghost" onClick={() => setInspectedDiff(null)}>
            Close Comparison
          </Button>
        }
      >
        <div className="grid md:grid-cols-2 gap-4 h-[65vh]">
          <div className="flex flex-col gap-2 rounded-ctl border border-white/10 bg-black/40 p-4">
            <span className="font-mono text-xs font-semibold text-cyan">
              {inspectedDiff?.submissionA.user.name} ({inspectedDiff?.submissionA.user.email})
            </span>
            <pre className="flex-1 overflow-auto font-mono text-xs text-ink/90 bg-black/50 p-3 rounded-ctl border border-white/5">
              {inspectedDiff?.submissionA.code}
            </pre>
          </div>

          <div className="flex flex-col gap-2 rounded-ctl border border-white/10 bg-black/40 p-4">
            <span className="font-mono text-xs font-semibold text-pink">
              {inspectedDiff?.submissionB.user.name} ({inspectedDiff?.submissionB.user.email})
            </span>
            <pre className="flex-1 overflow-auto font-mono text-xs text-ink/90 bg-black/50 p-3 rounded-ctl border border-white/5">
              {inspectedDiff?.submissionB.code}
            </pre>
          </div>
        </div>
      </Modal>

      {/* Disqualify Confirmation Modal */}
      <Modal
        isOpen={Boolean(disqualifyingUser)}
        onClose={() => setDisqualifyingUser(null)}
        title="Disqualify Participant?"
        description={`Are you sure you want to disqualify ${disqualifyingUser?.name}?`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDisqualifyingUser(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              className="bg-bad hover:bg-bad/90"
              loading={isDisqualifying}
              onClick={handleConfirmDisqualify}
            >
              Confirm Disqualification
            </Button>
          </>
        }
      >
        <p className="font-sans text-xs text-muted leading-relaxed">
          Disqualifying this student sets their contest score to 0 and excludes their submissions from the
          final leaderboard standings. This action is audited and logged in the system.
        </p>
      </Modal>
    </div>
  )
}
