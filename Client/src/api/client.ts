import { useAuthStore } from '../store/authStore'

const BASE_URL = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/+$/, '') || 'http://localhost:3000'

export interface ApiErrorPayload {
  code: string
  message: string
  requestId?: string
  details?: unknown
}

export class ApiClientError extends Error {
  status: number
  code: string
  details?: unknown
  retryAfter?: number
  rateLimitRemaining?: number

  constructor(status: number, error: ApiErrorPayload, retryAfter?: number, rateLimitRemaining?: number) {
    super(error.message || `Request failed with status ${status}`)
    this.name = 'ApiClientError'
    this.status = status
    this.code = error.code || 'UNKNOWN_ERROR'
    this.details = error.details
    this.retryAfter = retryAfter
    this.rateLimitRemaining = rateLimitRemaining
  }
}

interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown
  params?: Record<string, string | number | boolean | undefined | null>
}

export async function apiClient<T = unknown>(endpoint: string, options: RequestOptions = {}): Promise<T> {
  const { body, params, headers: customHeaders, ...customInit } = options

  // Build query string if params are provided
  let url = endpoint.startsWith('http') ? endpoint : `${BASE_URL}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`
  if (params) {
    const searchParams = new URLSearchParams()
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        searchParams.append(key, String(value))
      }
    })
    const queryString = searchParams.toString()
    if (queryString) {
      url += (url.includes('?') ? '&' : '?') + queryString
    }
  }

  const headers = new Headers(customHeaders)
  if (!(body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  // Inject accessToken from Zustand authStore
  const token = useAuthStore.getState().accessToken
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  const init: RequestInit = {
    ...customInit,
    headers,
  }

  if (body !== undefined) {
    init.body = body instanceof FormData ? body : JSON.stringify(body)
  }

  let response: Response
  try {
    response = await fetch(url, init)
  } catch (networkErr: any) {
    throw new ApiClientError(0, {
      code: 'NETWORK_ERROR',
      message: networkErr?.message?.includes('Failed to fetch')
        ? 'Could not connect to MockKernel backend server (connection refused).'
        : networkErr?.message || 'Network error occurred.',
      details: { url },
    })
  }

  // Rate-limit headers inspection
  const retryAfterHeader = response.headers.get('Retry-After')
  const retryAfter = retryAfterHeader ? parseInt(retryAfterHeader, 10) : undefined
  const remainingHeader = response.headers.get('X-RateLimit-Remaining')
  const rateLimitRemaining = remainingHeader ? parseInt(remainingHeader, 10) : undefined

  if (!response.ok) {
    // Auto-logout on 401 Unauthorized (unless already on auth login/register endpoint)
    if (response.status === 401 && !endpoint.includes('/api/auth/login') && !endpoint.includes('/api/auth/register')) {
      useAuthStore.getState().logout()
    }

    let errorPayload: ApiErrorPayload = {
      code: `HTTP_${response.status}`,
      message: response.statusText || 'An unexpected error occurred.',
    }

    try {
      const data = await response.json()
      if (data && typeof data === 'object') {
        if ('error' in data && typeof data.error === 'object' && data.error) {
          errorPayload = data.error as ApiErrorPayload
        } else if ('message' in data && typeof data.message === 'string') {
          errorPayload = {
            code: typeof data.code === 'string' ? data.code : `HTTP_${response.status}`,
            message: data.message,
            details: data,
          }
        }
      }
    } catch {
      // Non-JSON error body
    }

    throw new ApiClientError(response.status, errorPayload, retryAfter, rateLimitRemaining)
  }

  if (response.status === 204) {
    return undefined as unknown as T
  }

  const json = await response.json()
  return json as T
}

export const client = {
  get: <T = unknown>(endpoint: string, options?: RequestOptions) =>
    apiClient<T>(endpoint, { ...options, method: 'GET' }),
  post: <T = unknown>(endpoint: string, body?: unknown, options?: RequestOptions) =>
    apiClient<T>(endpoint, { ...options, method: 'POST', body }),
  patch: <T = unknown>(endpoint: string, body?: unknown, options?: RequestOptions) =>
    apiClient<T>(endpoint, { ...options, method: 'PATCH', body }),
  put: <T = unknown>(endpoint: string, body?: unknown, options?: RequestOptions) =>
    apiClient<T>(endpoint, { ...options, method: 'PUT', body }),
  delete: <T = unknown>(endpoint: string, options?: RequestOptions) =>
    apiClient<T>(endpoint, { ...options, method: 'DELETE' }),
}
