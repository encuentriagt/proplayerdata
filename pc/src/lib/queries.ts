import { useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query'
import { useRef } from 'react'
import { ApiError, newIdempotencyKey, request, requestIdempotent, type RequestOptions } from './api'
import { pcPath, useOrg } from './org'
import type {
  EventDetail, EventType, Invitation, Position, StatType, Member, PcEvent, PlanGrant, PlanUsage, Player, PlayerDetail,
  RosterEntry, Season, Sport, Team, TeamDetail,
} from './types'

export interface Paged<T> { data: T[]; meta: { current_page: number; last_page: number; total: number } }

function usePc() {
  const { slug } = useOrg()
  return { slug, path: (p: string) => pcPath(slug, p) }
}

export function useTeams() {
  const { slug, path } = usePc()
  return useQuery({ queryKey: [slug, 'teams'], queryFn: async () => (await request<Team[]>(path('teams'))).data })
}

export function useTeam(id: number | undefined) {
  const { slug, path } = usePc()
  return useQuery({
    queryKey: [slug, 'team', id],
    queryFn: async () => (await request<TeamDetail>(path(`teams/${id}`))).data,
    enabled: !!id,
  })
}

export function useRoster(teamId: number | undefined) {
  const { slug, path } = usePc()
  return useQuery({
    queryKey: [slug, 'roster', teamId],
    queryFn: async () => (await request<RosterEntry[]>(path(`teams/${teamId}/roster`))).data,
    enabled: !!teamId,
    staleTime: 60_000, // photo_url vence en 15 min: no se guarda más allá de la caché corta
  })
}

export function useSeasons() {
  const { slug, path } = usePc()
  return useQuery({ queryKey: [slug, 'seasons'], queryFn: async () => (await request<Season[]>(path('seasons'))).data })
}

/** Deportes activados por la organización que el miembro ve (admin: todos los activados; director/coach: su alcance). */
export function useOrgSports() {
  const { slug, path } = usePc()
  return useQuery({
    queryKey: [slug, 'sports'],
    queryFn: async () => (await request<(Sport & { positions: Position[]; stat_types: StatType[] })[]>(path('sports'))).data,
    staleTime: 5 * 60_000,
  })
}

/** Catálogo general de ppd (todos los deportes). Solo para que el admin elija cuáles activar. */
export function useSports() {
  return useQuery({
    queryKey: ['catalog', 'sports'],
    queryFn: async () => (await request<Sport[]>('catalog/sports')).data,
    staleTime: 30 * 60_000,
  })
}

export function useEvents(params: { from: string; to: string; team_id?: number; type?: EventType; sport_id?: number }) {
  const { slug, path } = usePc()
  return useQuery({
    queryKey: [slug, 'events', params],
    queryFn: async () => (await request<PcEvent[]>(path('events'), { query: { ...params } })).data,
  })
}

/** Partidos ya jugados (últimos 120 días), no cancelados y sin resultado publicado. */
export function usePendingSheets(sportId?: number) {
  const { slug, path } = usePc()
  return useQuery({
    queryKey: [slug, 'events', 'pending_sheet', sportId],
    queryFn: async () => (await request<PcEvent[]>(path('events'), { query: { pending_sheet: 1, sport_id: sportId } })).data,
  })
}

export function useEvent(id: number | undefined) {
  const { slug, path } = usePc()
  return useQuery({
    queryKey: [slug, 'event', id],
    queryFn: async () => (await request<EventDetail>(path(`events/${id}`))).data,
    enabled: !!id,
  })
}

export function usePlayers(params: { team_id?: number; search?: string; page?: number }) {
  const { slug, path } = usePc()
  return useQuery({
    queryKey: [slug, 'players', params],
    queryFn: async () => (await request<Player[], Paged<Player>['meta']>(path('players'), { query: { ...params } })) as Paged<Player>,
    placeholderData: (prev) => prev,
    staleTime: 60_000,
  })
}

export function usePlayer(id: number | undefined) {
  const { slug, path } = usePc()
  return useQuery({
    queryKey: [slug, 'player', id],
    queryFn: async () => (await request<PlayerDetail>(path(`players/${id}`))).data,
    enabled: !!id,
    staleTime: 60_000,
  })
}

export function useMembers(enabled = true) {
  const { slug, path } = usePc()
  return useQuery({ queryKey: [slug, 'members'], queryFn: async () => (await request<Member[]>(path('members'))).data, enabled })
}

export function useInvitations() {
  const { slug, path } = usePc()
  return useQuery({ queryKey: [slug, 'invitations'], queryFn: async () => (await request<Invitation[]>(path('invitations'))).data })
}

export function usePlans() {
  const { slug, path } = usePc()
  return useQuery({
    queryKey: [slug, 'plans'],
    queryFn: async () => (await request<PlanGrant[], { usage: PlanUsage }>(path('plans'))) as { data: PlanGrant[]; meta: { usage: PlanUsage } },
  })
}

interface MutationSpec<V, R> {
  method: NonNullable<RequestOptions['method']>
  path: string | ((v: V) => string)
  body?: (v: V) => unknown
  /** Rutas ♻️: se manda Idempotency-Key (una por acción del usuario, la misma en reintentos). */
  idempotent?: boolean
  invalidate?: QueryKey[]
  onSuccess?: (data: R, v: V) => void
}

/** Mutación de la PC. Con `idempotent`, la clave se genera al iniciar la acción y se reusa en cada reintento. */
export function usePcMutation<V = void, R = unknown>(spec: MutationSpec<V, R>) {
  const { slug, path } = usePc()
  const qc = useQueryClient()
  const keyRef = useRef<string | null>(null)

  const m = useMutation({
    mutationFn: async (v: V) => {
      const p = path(typeof spec.path === 'function' ? spec.path(v) : spec.path)
      const opts: RequestOptions = { method: spec.method, body: spec.body ? spec.body(v) : (v as unknown) ?? undefined }
      if (spec.idempotent) {
        keyRef.current ??= newIdempotencyKey()
        return (await requestIdempotent<R>(p, { ...opts, idempotencyKey: keyRef.current })).data
      }
      return (await request<R>(p, opts)).data
    },
    onSuccess: (data, v) => {
      keyRef.current = null // la próxima acción del usuario usa una clave nueva
      spec.invalidate?.forEach((k) => qc.invalidateQueries({ queryKey: [slug, ...k] }))
      spec.onSuccess?.(data, v)
    },
    onError: (e) => {
      // Si fue un error de validación/negocio, la próxima acción es otra (cuerpo distinto): clave nueva.
      if (e instanceof ApiError && e.status > 0 && e.status < 500) keyRef.current = null
    },
  })
  return m
}
