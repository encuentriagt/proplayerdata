import { createContext, useCallback, useContext, useEffect, useMemo, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { onUnauthorized, request } from './api'
import { clearToken, getToken, setToken } from './session'
import type { LoginResult, Membership, OrgPermissions, Role, Session } from './types'

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

/** Rol más alto, solo para mostrar la etiqueta ("Coach", "Director técnico"...). Nunca para decidir permisos. */
export function topRole(memberships: Membership[]): Role | null {
  return memberships.reduce<Role | null>((best, m) => (!best || RANK[m.role] > RANK[best] ? m.role : best), null)
}

export const NO_PERMISSIONS: OrgPermissions = {
  invite_roles: [], manage_members: false, manage_directors: false, manage_seasons: false, manage_plans: false,
  manage_branding: false, manage_sports: false, manage_positions: [], create_teams: [], delete_players: false, create_players_without_team: false, director_scope: null,
}

/** Permisos de la organización tal como los manda la API (iguales en todas las membresías de esa organización). */
export function permissionsFor(memberships: Membership[]): OrgPermissions {
  return memberships.find((m) => m.permissions)?.permissions ?? NO_PERMISSIONS
}

export function canCreateTeams(p: OrgPermissions): boolean {
  return p.create_teams === 'all' || p.create_teams.length > 0
}

export function canCreateTeamInSport(p: OrgPermissions, sportId: number): boolean {
  return p.create_teams === 'all' || p.create_teams.includes(sportId)
}

/** ¿Tiene algo que hacer en Administración? */
export function hasAdminArea(p: OrgPermissions): boolean {
  return p.manage_members || p.manage_seasons || p.manage_plans || p.manage_branding || p.manage_sports || canCreateTeams(p)
}
