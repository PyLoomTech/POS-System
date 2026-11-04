import axios from 'axios'
import type { AxiosError, AxiosRequestConfig } from 'axios'

const ACCESS_KEY = 'pyloom.access'
const REFRESH_KEY = 'pyloom.refresh'

export const tokenStore = {
  get access(): string | null {
    return localStorage.getItem(ACCESS_KEY)
  },
  get refresh(): string | null {
    return localStorage.getItem(REFRESH_KEY)
  },
  set(access: string, refresh?: string) {
    localStorage.setItem(ACCESS_KEY, access)
    if (refresh) localStorage.setItem(REFRESH_KEY, refresh)
  },
  clear() {
    localStorage.removeItem(ACCESS_KEY)
    localStorage.removeItem(REFRESH_KEY)
  },
}

// NOTE: do NOT set a default Content-Type here. Axios already sends
// application/json for object bodies, and an explicit JSON default makes it
// JSON.stringify FormData uploads (losing the file + multipart boundary).
export const api = axios.create({
  baseURL: '/api/v1',
})

api.interceptors.request.use((config) => {
  const token = tokenStore.access
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

let refreshPromise: Promise<string> | null = null

async function refreshAccessToken(): Promise<string> {
  const refresh = tokenStore.refresh
  if (!refresh) throw new Error('No refresh token available')
  const { data } = await axios.post('/api/v1/auth/refresh', { token: refresh })
  tokenStore.set(data.accessToken, data.refreshToken)
  return data.accessToken as string
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as (AxiosRequestConfig & { _retry?: boolean }) | undefined
    const status = error.response?.status
    const isAuthCall = original?.url?.includes('/auth/') ?? false

    if (status === 401 && original && !original._retry && !isAuthCall && tokenStore.refresh) {
      original._retry = true
      try {
        refreshPromise = refreshPromise ?? refreshAccessToken()
        const newToken = await refreshPromise
        refreshPromise = null
        original.headers = { ...original.headers, Authorization: `Bearer ${newToken}` }
        return api(original)
      } catch (refreshError) {
        refreshPromise = null
        tokenStore.clear()
        if (!window.location.pathname.startsWith('/login')) {
          window.location.href = '/login'
        }
        return Promise.reject(refreshError)
      }
    }

    return Promise.reject(error)
  },
)

export function getErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as { error?: string } | undefined
    if (data?.error) return data.error
    if (error.code === 'ERR_NETWORK') return 'Cannot reach the server. Is the backend running?'
    return error.message
  }
  if (error instanceof Error) return error.message
  return 'Something went wrong. Please try again.'
}
