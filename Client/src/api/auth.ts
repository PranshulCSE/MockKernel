import { client, ApiClientError } from './client'
import type {
  AuthResponse,
  AuthUser,
  LoginPayload,
  RegisterPayload,
} from '../types/auth'

export class AuthError extends Error {
  code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'AuthError'
    this.code = code
  }
}

export async function login(payload: LoginPayload): Promise<AuthResponse> {
  try {
    const res = await client.post<{ data: AuthResponse }>('/api/auth/login', {
      email: payload.email.trim(),
      password: payload.password,
    })
    return res.data
  } catch (err) {
    if (err instanceof ApiClientError) {
      throw new AuthError(err.code, err.message)
    }
    throw new AuthError('LOGIN_FAILED', 'Failed to log in. Please try again.')
  }
}

export async function register(payload: RegisterPayload): Promise<AuthResponse> {
  try {
    const res = await client.post<{ data: AuthResponse }>('/api/auth/register', {
      name: payload.name.trim(),
      email: payload.email.trim(),
      password: payload.password,
    })
    return res.data
  } catch (err) {
    if (err instanceof ApiClientError) {
      throw new AuthError(err.code, err.message)
    }
    throw new AuthError('REGISTER_FAILED', 'Failed to register. Please try again.')
  }
}

export async function loginWithGoogle(idToken: string): Promise<AuthResponse> {
  try {
    const res = await client.post<{ data: AuthResponse }>('/api/auth/google', { idToken })
    return res.data
  } catch (err) {
    if (err instanceof ApiClientError) {
      throw new AuthError(err.code, err.message)
    }
    throw new AuthError('GOOGLE_FAILED', 'Google sign-in failed. Please try again.')
  }
}

export async function getMe(): Promise<AuthUser> {
  try {
    const res = await client.get<{ data: { user: AuthUser } }>('/api/auth/me')
    return res.data.user
  } catch (err) {
    if (err instanceof ApiClientError) {
      throw new AuthError(err.code, err.message)
    }
    throw new AuthError('AUTH_ME_FAILED', 'Failed to fetch current user.')
  }
}

export async function logout(): Promise<void> {
  try {
    await client.post('/api/auth/logout')
  } catch {
    // Best effort on logout
  }
}
