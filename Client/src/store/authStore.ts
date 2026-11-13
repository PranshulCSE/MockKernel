import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import * as authApi from '../api/auth'
import type { AuthResponse, AuthUser, LoginPayload, RegisterPayload } from '../types/auth'

interface AuthState {
  user: AuthUser | null
  accessToken: string | null
  login: (payload: LoginPayload) => Promise<void>
  register: (payload: RegisterPayload) => Promise<void>
  loginWithGoogle: (googleIdToken: string) => Promise<void>
  logout: () => void
}

// Token storage in localStorage is TEMPORARY. The JWT storage strategy
// (httpOnly cookie vs header) is an open decision owned by F1.
export const useAuthStore = create<AuthState>()(
  persist(
    (set) => {
      const apply = ({ user, accessToken }: AuthResponse): void => {
        set({ user, accessToken })
      }
      return {
        user: null,
        accessToken: null,
        login: async (payload) => {
          apply(await authApi.login(payload))
        },
        register: async (payload) => {
          apply(await authApi.register(payload))
        },
        loginWithGoogle: async (googleIdToken) => {
          apply(await authApi.loginWithGoogle(googleIdToken))
        },
        logout: () => {
          set({ user: null, accessToken: null })
        },
      }
    },
    { name: 'mk_auth', partialize: (s) => ({ user: s.user, accessToken: s.accessToken }) },
  ),
)
