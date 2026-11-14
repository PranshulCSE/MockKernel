import { useEffect } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router'
import { useAuthStore } from '../../store/authStore'
import { toast } from '../ui/Toast'
import type { UserRole } from '../../types/auth'

export function RequireAuth() {
  const user = useAuthStore((s) => s.user)
  const isHydrated = useAuthStore((s) => s.isHydrated)
  const location = useLocation()

  if (!isHydrated) {
    return null
  }

  if (!user) return <Navigate to="/login" replace state={{ from: location }} />
  return <Outlet />
}

export function GuestOnly() {
  const user = useAuthStore((s) => s.user)
  const isHydrated = useAuthStore((s) => s.isHydrated)

  if (!isHydrated) {
    return null
  }

  if (user) return <Navigate to="/" replace />
  return <Outlet />
}

function UnauthorizedRedirect() {
  useEffect(() => {
    toast.warn('You do not have permission to access that resource.', 'Access Denied')
  }, [])
  return <Navigate to="/" replace />
}

export function RequireRole({ roles }: { roles: UserRole[] }) {
  const user = useAuthStore((s) => s.user)
  const isHydrated = useAuthStore((s) => s.isHydrated)
  const location = useLocation()

  if (!isHydrated) {
    return null
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  if (!roles.includes(user.role)) {
    return <UnauthorizedRedirect />
  }

  return <Outlet />
}
