import type {
  AuthErrorCode,
  AuthResponse,
  AuthUser,
  LoginPayload,
  RegisterPayload,
} from '../types/auth'

// MOCK API. Same function signatures the real backend (F1, Engineer 1) will expose,
// so only this file changes when the server is ready. Passwords are stored in
// plain text in localStorage here ONLY because this is a throwaway mock.

export class AuthError extends Error {
  code: AuthErrorCode

  constructor(code: AuthErrorCode, message: string) {
    super(message)
    this.code = code
  }
}

interface StoredUser extends AuthUser {
  password: string
}

const USERS_KEY = 'mk_mock_users'
const wait = (ms = 700) => new Promise((resolve) => setTimeout(resolve, ms))

function readUsers(): StoredUser[] {
  try {
    return JSON.parse(localStorage.getItem(USERS_KEY) ?? '[]') as StoredUser[]
  } catch {
    return []
  }
}

function writeUsers(users: StoredUser[]): void {
  localStorage.setItem(USERS_KEY, JSON.stringify(users))
}

function toResponse(stored: StoredUser): AuthResponse {
  const user: AuthUser = {
    id: stored.id,
    name: stored.name,
    email: stored.email,
    role: stored.role,
  }
  return { user, accessToken: `mock-token-${user.id}` }
}

export async function login({ email, password }: LoginPayload): Promise<AuthResponse> {
  await wait()
  const found = readUsers().find((u) => u.email === email.toLowerCase().trim())
  if (!found || found.password !== password) {
    throw new AuthError('INVALID_CREDENTIALS', 'Email or password is incorrect.')
  }
  return toResponse(found)
}

export async function register({ name, email, password }: RegisterPayload): Promise<AuthResponse> {
  await wait()
  const users = readUsers()
  const normalized = email.toLowerCase().trim()
  if (users.some((u) => u.email === normalized)) {
    throw new AuthError('EMAIL_TAKEN', 'An account with this email already exists. Log in instead.')
  }
  const created: StoredUser = {
    id: crypto.randomUUID(),
    name: name.trim(),
    email: normalized,
    role: 'user',
    password,
  }
  writeUsers([...users, created])
  return toResponse(created)
}

// The real version sends the Google token to the backend, which verifies it.
export async function loginWithGoogle(googleToken: string): Promise<AuthResponse> {
  await wait(500)
  if (!googleToken) throw new AuthError('GOOGLE_FAILED', 'Google sign-in was cancelled.')
  const users = readUsers()
  const email = 'google.student@mockkernel.dev'
  const existing = users.find((u) => u.email === email)
  if (existing) return toResponse(existing)
  const created: StoredUser = {
    id: crypto.randomUUID(),
    name: 'Google Student',
    email,
    role: 'user',
    password: '',
  }
  writeUsers([...users, created])
  return toResponse(created)
}
