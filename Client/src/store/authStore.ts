import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import * as authApi from '../api/auth'
import type { AuthResponse, AuthUser, LoginPayload, RegisterPayload } from '../types/auth'

interface AuthState {
  user: AuthUser | null
  accessToken: string | null
  isHydrated: boolean
  login: (payload: LoginPayload) => Promise<void>
  register: (payload: RegisterPayload) => Promise<void>
  loginWithGoogle: (googleToken: string) => Promise<void>
  logout: () => Promise<void>
  hydrate: () => Promise<void>
  setUser: (user: AuthUser | null) => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => {
      const apply = ({ user, accessToken }: AuthResponse): void => {
        set({ user, accessToken, isHydrated: true })
      }

      return {
        user: null,
        accessToken: null,
        isHydrated: false,
        setUser: (user) => set({ user }),
        login: async (payload) => {
          const res = await authApi.login(payload)
          apply(res)
        },
        register: async (payload) => {
          const res = await authApi.register(payload)
          apply(res)
        },
        loginWithGoogle: async (token) => {
          const res = await authApi.loginWithGoogle(token)
          apply(res)
        },
        logout: async () => {
          try {
            await authApi.logout()
          } catch {
            // Best effort
          } finally {
            set({ user: null, accessToken: null, isHydrated: true })
          }
        },
        hydrate: async () => {
          const token = get().accessToken
          if (!token) {
            set({ user: null, isHydrated: true })
            return
          }
          try {
            const user = await authApi.getMe()
            set({ user, isHydrated: true })
          } catch {
            // Token invalid or expired
            set({ user: null, accessToken: null, isHydrated: true })
          }
        },
      }
    },
    {
      name: 'mk_auth',
      partialize: (s) => ({ user: s.user, accessToken: s.accessToken }),
      onRehydrateStorage: () => (state) => {
        // Let Zustand finish merging the persisted state before verifying the token.
        // Calling hydrate() synchronously here can read a null accessToken and overwrite storage.
        if (state) {
          setTimeout(() => {
            void state.hydrate()
          }, 0)
        }
      },
    },
  ),
)
