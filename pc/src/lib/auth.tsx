import { createContext, useCallback, useContext, useEffect, useMemo, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { onUnauthorized, request } from './api'
import { clearToken, getToken, setToken } from './session'
import type { LoginResult, Membership, Role, Session } from './types'

interface AuthValue {
  session: Session | null
  loading: boolean
  login: (email: string, password: string, remember: boolean) => Promise<LoginResult>
  logout: () => Promise<void>
  refresh: () => Promise<unknown>
  membershipsFor: (slug: string) => Membership[]
}

const AuthContext = createContext<AuthValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient()
  const hasToken = !!getToken()

  const me = useQuery({
    queryKey: ['me'],
    queryFn: async () => (await request<Session>('auth/me')).data,
    enabled: hasToken,
    staleTime: 60_000,
    retry: false,
  })

  useEffect(
    () =>
      onUnauthorized(() => {
        qc.setQueryData(['me'], null)
        qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'branding' })
      }),
    [qc],
  )

  const login = useCallback(
    async (email: string, password: string, remember: boolean) => {
      const res = await request<LoginResult>('auth/login', {
        method: 'POST',
        body: { email, password },
        headers: { 'X-App-Platform': 'web' },
        anonymous: true,
      })
      setToken(res.data.token, remember)
      const { user, memberships, is_guardian } = res.data
      qc.setQueryData<Session>(['me'], { user, memberships, is_guardian })
      return res.data
    },
    [qc],
  )

  const logout = useCallback(async () => {
    try {
      await request('auth/logout', { method: 'POST' })
    } catch {
      /* se cierra igual en el navegador */
    }
    clearToken()
    qc.clear()
  }, [qc])

  const value = useMemo<AuthValue>(() => {
    const session = getToken() ? (me.data ?? null) : null
    return {
      session,
      loading: hasToken && me.isLoading,
      login,
      logout,
      refresh: () => me.refetch(),
      membershipsFor: (slug) => session?.memberships.filter((m) => m.organization.slug === slug) ?? [],
    }
  }, [me, hasToken, login, logout])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth fuera de AuthProvider')
  return ctx
}

const RANK: Record<Role, number> = { coach: 1, director: 2, org_admin: 3 }

/** Rol más alto del usuario en la organización (un usuario puede tener varios). */
export function topRole(memberships: Membership[]): Role | null {
  return memberships.reduce<Role | null>((best, m) => (!best || RANK[m.role] > RANK[best] ? m.role : best), null)
}

export interface Permissions {
  role: Role | null
  isAdmin: boolean
  seesAllTeams: boolean
  brandingEditable: boolean
}

export function permissionsFor(memberships: Membership[]): Permissions {
  const role = topRole(memberships)
  return {
    role,
    isAdmin: role === 'org_admin',
    seesAllTeams: role === 'org_admin' || role === 'director',
    brandingEditable: memberships.some((m) => m.role === 'org_admin' && m.branding_editable === true),
  }
}
