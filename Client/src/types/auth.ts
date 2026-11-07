export type UserRole = 'user' | 'admin' | 'superadmin'

export interface AuthUser {
  id: string
  name: string
  email: string
  role: UserRole
}

export interface AuthResponse {
  user: AuthUser
  accessToken: string
}

export interface LoginPayload {
  email: string
  password: string
}

export interface RegisterPayload extends LoginPayload {
  name: string
}

export type AuthErrorCode = 'INVALID_CREDENTIALS' | 'EMAIL_TAKEN' | 'GOOGLE_FAILED'
