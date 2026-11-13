import { useState, useEffect, useCallback } from 'react'
import { Plus, Search, ShieldCheck, UserPlus, Users } from 'lucide-react'
import {
  Button,
  Badge,
  DataTable,
  Modal,
  Input,
  useToast,
  type Column,
  EmptyState,
} from '../../components/ui'
import {
  listAdminUsers,
  createAdminUser,
  type AdminUserItem,
} from '../../api/admin'
import { useAuthStore } from '../../store/authStore'

export default function AdminUsersPage() {
  const user = useAuthStore((s) => s.user)
  const toast = useToast()

  const [users, setUsers] = useState<AdminUserItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalItems, setTotalItems] = useState(0)

  // Filters
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<string>('all')

  // Create Admin Modal
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [adminName, setAdminName] = useState('')
  const [adminEmail, setAdminEmail] = useState('')
  const [adminPassword, setAdminPassword] = useState('')

  const isSuperAdmin = user?.role === 'superadmin'

  const loadUsers = useCallback(
    async (targetPage = 1, searchQuery = search, role = roleFilter) => {
      setIsLoading(true)
      try {
        const res = await listAdminUsers({
          page: targetPage,
          limit: 10,
          search: searchQuery.trim() || undefined,
          role: role !== 'all' ? role : undefined,
        })
        setUsers(res.data || [])
        setPage(res.pagination?.page || 1)
        setTotalPages(res.pagination?.totalPages || 1)
        setTotalItems(res.pagination?.total || 0)
      } catch {
        toast.error('Failed to load users.')
      } finally {
        setIsLoading(false)
      }
    },
    [search, roleFilter, toast],
  )

  useEffect(() => {
    if (isSuperAdmin) {
      void loadUsers(page)
    }
  }, [page, isSuperAdmin, loadUsers])

  const handleCreateAdmin = async () => {
    if (!adminName.trim()) {
      toast.warn('Name is required.')
      return
    }
    if (!adminEmail.trim() || !adminEmail.includes('@')) {
      toast.warn('A valid email address is required.')
      return
    }
    if (adminPassword.length < 8) {
      toast.warn('Password must be at least 8 characters long.')
      return
    }

    setIsCreating(true)
    try {
      await createAdminUser({
        name: adminName.trim(),
        email: adminEmail.trim(),
        password: adminPassword,
      })
      toast.success(`Admin account created for ${adminEmail}.`, 'Success')
      setIsModalOpen(false)
      setAdminName('')
      setAdminEmail('')
      setAdminPassword('')
      void loadUsers(1)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to provision admin.'
      toast.error(msg, 'Creation Error')
    } finally {
      setIsCreating(false)
    }
  }

  if (!isSuperAdmin) {
    return (
      <EmptyState
        icon={ShieldCheck}
        heading="SuperAdmin Privileges Required"
        description="Only users with the 'superadmin' role have permission to access user management and provision accounts."
        className="p-16"
      />
    )
  }

  const columns: Column<AdminUserItem & Record<string, unknown>>[] = [
    {
      key: 'name',
      header: 'Name',
      sortable: true,
      render: (row) => (
        <div className="flex items-center gap-3">
          <span className="grid size-8 place-items-center rounded-full bg-white/10 font-bold text-xs text-ink">
            {row.name.charAt(0).toUpperCase()}
          </span>
          <span className="font-sans text-sm font-semibold text-ink">{row.name}</span>
        </div>
      ),
    },
    {
      key: 'email',
      header: 'Email',
      sortable: true,
      render: (row) => <span className="font-mono text-xs text-muted">{row.email}</span>,
    },
    {
      key: 'role',
      header: 'Assigned Role',
      render: (row) => {
        const tone: 'flag' | 'run' | 'ok' =
          row.role === 'superadmin' ? 'flag' : row.role === 'admin' ? 'run' : 'ok'
        return <Badge tone={tone}>{row.role.toUpperCase()}</Badge>
      },
    },
    {
      key: 'createdAt',
      header: 'Registered',
      sortable: true,
      render: (row) => (
        <span className="font-mono text-xs text-muted">
          {row.createdAt ? new Date(row.createdAt).toLocaleDateString() : '-'}
        </span>
      ),
    },
  ]

  return (
    <div className="flex flex-col gap-6">
      {/* Top Header Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <input
              type="text"
              placeholder="Search by name or email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void loadUsers(1, search, roleFilter)}
              className="w-full rounded-full border border-white/10 bg-white/5 py-2 pl-10 pr-4 text-xs font-sans text-ink placeholder-muted focus:border-cyan focus:outline-none focus:ring-1 focus:ring-cyan"
            />
          </div>

          <select
            value={roleFilter}
            onChange={(e) => {
              const r = e.target.value
              setRoleFilter(r)
              void loadUsers(1, search, r)
            }}
            className="h-9 rounded-full border border-white/10 bg-white/5 px-3 font-sans text-xs text-ink focus:border-cyan focus:outline-none"
          >
            <option value="all" className="bg-base text-ink">
              All Roles
            </option>
            <option value="user" className="bg-base text-ink">
              Users (Students)
            </option>
            <option value="admin" className="bg-base text-ink">
              Admins
            </option>
            <option value="superadmin" className="bg-base text-ink">
              SuperAdmins
            </option>
          </select>
        </div>

        <Button
          variant="primary"
          leftIcon={<UserPlus className="size-4" />}
          onClick={() => setIsModalOpen(true)}
        >
          Create Admin
        </Button>
      </div>

      {/* Users Table */}
      <DataTable
        data={users as unknown as Array<AdminUserItem & Record<string, unknown>>}
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
            icon={Users}
            heading="No users match your criteria"
            description="Try modifying your search query or role filter."
            className="border-none bg-transparent shadow-none"
          />
        }
      />

      {/* Create Admin Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Provision Admin Account"
        description="Add a new administrator to manage problems, oversee contests, and access live telemetry."
        footer={
          <>
            <Button variant="ghost" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              loading={isCreating}
              leftIcon={<Plus className="size-4" />}
              onClick={handleCreateAdmin}
            >
              Provision Account
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4 py-2">
          <Input
            label="Full Name"
            placeholder="e.g. Jane Doe"
            value={adminName}
            onChange={(e) => setAdminName(e.target.value)}
          />
          <Input
            type="email"
            label="Email Address"
            placeholder="admin@mockkernel.dev"
            value={adminEmail}
            onChange={(e) => setAdminEmail(e.target.value)}
          />
          <Input
            type="password"
            label="Initial Password (min 8 characters)"
            placeholder="••••••••"
            value={adminPassword}
            onChange={(e) => setAdminPassword(e.target.value)}
          />
        </div>
      </Modal>
    </div>
  )
}
