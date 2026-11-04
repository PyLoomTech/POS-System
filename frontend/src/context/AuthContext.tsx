import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { api, tokenStore } from '@/lib/api'
import type { AuthUser } from '@/types'

interface AuthContextValue {
  user: AuthUser | null
  loading: boolean
  login: (username: string, password: string) => Promise<void>
  logout: () => Promise<void>
  hasPermission: (permission: string) => boolean
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function bootstrap() {
      if (!tokenStore.access) {
        setLoading(false)
        return
      }
      try {
        const { data } = await api.get<AuthUser>('/auth/me')
        if (!cancelled) setUser(data)
      } catch {
        tokenStore.clear()
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void bootstrap()
    return () => {
      cancelled = true
    }
  }, [])

  const login = useCallback(async (username: string, password: string) => {
    const { data } = await api.post('/auth/login', { username, password })
    tokenStore.set(data.accessToken, data.refreshToken)
    const me = await api.get<AuthUser>('/auth/me')
    setUser(me.data)
  }, [])

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout')
    } catch {
      // Ignore network errors on logout; clear the session regardless.
    }
    tokenStore.clear()
    setUser(null)
  }, [])

  const hasPermission = useCallback(
    (permission: string) => {
      if (!user) return false
      if (user.role?.name === 'Super Administrator') return true
      return user.permissions.includes(permission)
    },
    [user],
  )

  const value = useMemo(
    () => ({ user, loading, login, logout, hasPermission }),
    [user, loading, login, logout, hasPermission],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within an AuthProvider')
  return context
}
