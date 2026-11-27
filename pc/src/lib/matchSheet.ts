// Lógica pura de la ficha del partido (sin React) para poder probarla con Vitest.
import type { EventDetail, MatchAction, Position, RosterEntry, StatType } from './types'

export interface LineupRow {
  played: boolean
  is_starter: boolean
  sport_position_id: number | null
  jersey_number: number | null
  minutes_played: number | null
}

export interface StatTap { stat_code: string; player_id: number; value: number; minute: number | null; period: number | null }
export interface Sub { in_id: number | null; out_id: number | null; minute: number | null }

export interface SheetState {
  score_us: number
  score_them: number
  lineup: Record<number, LineupRow>
  stats: StatTap[]
  subs: Sub[]
  /** Acciones que esta pantalla no edita (notas, etc.): se conservan tal cual. */
  other: MatchAction[]
}

export function emptyRow(r?: Pick<RosterEntry, 'jersey_number' | 'position'>): LineupRow {
  return { played: false, is_starter: false, sport_position_id: r?.position?.id ?? null, jersey_number: r?.jersey_number ?? null, minutes_played: null }
}

/** Estado inicial a partir del evento guardado; si no hay alineación, se precargan los convocados. */
export function sheetFromEvent(ev: EventDetail, roster: RosterEntry[]): SheetState {
  const lineup: Record<number, LineupRow> = {}
  roster.forEach((r) => { lineup[r.id] = emptyRow(r) })

  if (ev.lineup.length) {
    ev.lineup.forEach((l) => {
      lineup[l.player_id] = {
        played: true, is_starter: l.is_starter, sport_position_id: l.sport_position_id,
        jersey_number: l.jersey_number, minutes_played: l.minutes_played,
      }
    })
  } else {
    ev.callups.filter((c) => c.status === 'called').forEach((c) => {
      if (lineup[c.player_id]) lineup[c.player_id].played = true
    })
  }

  const stats: StatTap[] = []
  const subs: Sub[] = []
  const other: MatchAction[] = []
  ev.actions.forEach((a) => {
    const type = a.type ?? 'stat'
    if (type === 'stat' && a.stat_code && a.player_id) {
      stats.push({ stat_code: a.stat_code, player_id: a.player_id, value: a.value ?? 1, minute: a.minute ?? null, period: a.period ?? null })
    } else if (type === 'sub_in') {
      subs.push({ in_id: a.player_id ?? null, out_id: a.related_player_id ?? null, minute: a.minute ?? null })
    } else if (type !== 'sub_out') {
      other.push(a)
    }
  })

  return { score_us: ev.score_us ?? 0, score_them: ev.score_them ?? 0, lineup, stats, subs, other }
}

/** Estadísticas que la PC no muestra en la ficha (lo pidió el colegio). Si ya existían, se conservan al guardar. */
export const HIDDEN_STAT_CODES = new Set(['assist', 'own_goal', 'save'])

export function visibleStatTypes(types: StatType[]): StatType[] {
  return types.filter((t) => !HIDDEN_STAT_CODES.has(t.code))
}

/** Gol en contra: solo para el portero; se suma solo cuando el rival anota. */
export const CONCEDED = 'goal_conceded'

/** Portero: posición POR del catálogo (o una posición del colegio llamada Portero/Arquero). */
export function isGoalkeeper(positionId: number | null, positions: Position[]): boolean {
  const p = positions.find((x) => x.id === positionId)
  return !!p && (p.code.toUpperCase() === 'POR' || p.code.toUpperCase() === 'GK' || /portero|arquero/i.test(p.name))
}

/** Portero que recibe el gol: el que jugó, y si jugaron varios, el titular. */
export function goalkeeperFor(s: SheetState, positions: Position[]): number | null {
  const gks = Object.entries(s.lineup)
    .filter(([, r]) => r.played && isGoalkeeper(r.sport_position_id, positions))
    .map(([id, r]) => ({ id: Number(id), starter: r.is_starter }))
  return (gks.find((g) => g.starter) ?? gks[0])?.id ?? null
}

/**
 * Cambia el marcador del rival. Si el catálogo tiene "Gol en contra", el gol se le suma (o se le quita)
 * al portero que jugó.
 */
export function rivalScore(s: SheetState, delta: 1 | -1, statTypes: StatType[], positions: Position[]): SheetState {
  const score_them = Math.min(999, Math.max(0, s.score_them + delta))
  if (score_them === s.score_them) return s
  let next = { ...s, score_them }
  if (!statTypes.some((t) => t.code === CONCEDED)) return next
  if (delta > 0) {
    const gk = goalkeeperFor(s, positions)
    if (gk !== null) next = { ...next, stats: [...next.stats, { stat_code: CONCEDED, player_id: gk, value: 1, minute: null, period: null }] }
  } else {
    const last = [...next.stats].reverse().find((t) => t.stat_code === CONCEDED)
    if (last) next = tapMinus(next, last.player_id, CONCEDED)
  }
  return next
}

export function statCount(s: SheetState, playerId: number, code: string): number {
  return s.stats.reduce((n, t) => (t.player_id === playerId && t.stat_code === code ? n + t.value : n), 0)
}

/** + : agrega una acción {stat_code, player_id}. El jugador queda marcado como "jugó". */
export function tapPlus(s: SheetState, playerId: number, code: string, statTypes?: StatType[]): SheetState {
  const row = s.lineup[playerId] ?? emptyRow()
  return withScore({
    ...s,
    lineup: { ...s.lineup, [playerId]: { ...row, played: true } },
    stats: [...s.stats, { stat_code: code, player_id: playerId, value: 1, minute: null, period: null }],
  }, statTypes)
}

/** El marcador de nuestro equipo es la suma de lo que anotaron nuestros jugadores. */
function withScore(s: SheetState, statTypes?: StatType[]): SheetState {
  return statTypes ? { ...s, score_us: scoredByPlayers(s, statTypes) } : s
}

/** − : quita la última acción de ese jugador y estadística (o resta 1 si tenía valor > 1). */
export function tapMinus(s: SheetState, playerId: number, code: string, statTypes?: StatType[]): SheetState {
  for (let i = s.stats.length - 1; i >= 0; i--) {
    const t = s.stats[i]
    if (t.player_id === playerId && t.stat_code === code) {
      const stats = [...s.stats]
      if (t.value > 1) stats[i] = { ...t, value: t.value - 1 }
      else stats.splice(i, 1)
      return withScore({ ...s, stats }, statTypes)
    }
  }
  return s
}

/** Suma de lo que anotaron nuestros jugadores según `scores` del catálogo (autogol no cuenta). */
export function scoredByPlayers(s: SheetState, statTypes: StatType[]): number {
  const pts = new Map(statTypes.map((t) => [t.code, t.scores]))
  return s.stats.reduce((n, t) => (t.stat_code === 'own_goal' ? n : n + (pts.get(t.stat_code) ?? 0) * t.value), 0)
}

export interface SheetPayload {
  score_us: number
  score_them: number
  publish: boolean
  lineup: { player_id: number; is_starter: boolean; sport_position_id: number | null; jersey_number: number | null; minutes_played: number | null }[]
  actions: MatchAction[]
}

export function toPayload(s: SheetState, publish: boolean): SheetPayload {
  const lineup = Object.entries(s.lineup)
    .filter(([, r]) => r.played)
    .map(([id, r]) => ({
      player_id: Number(id), is_starter: r.is_starter, sport_position_id: r.sport_position_id,
      jersey_number: r.jersey_number, minutes_played: r.minutes_played,
    }))

  const actions: MatchAction[] = [
    ...s.stats.map((t) => ({
      stat_code: t.stat_code, player_id: t.player_id, value: t.value,
      ...(t.minute !== null ? { minute: t.minute } : {}), ...(t.period !== null ? { period: t.period } : {}),
    })),
    ...s.subs
      .filter((x) => x.in_id || x.out_id)
      .map((x) => ({ type: 'sub_in' as const, player_id: x.in_id, related_player_id: x.out_id, ...(x.minute !== null ? { minute: x.minute } : {}) })),
    ...s.other,
  ]

  return { score_us: s.score_us, score_them: s.score_them, publish, lineup, actions }
}

// Borrador local mientras se edita (por si se pierde la señal en la cancha).
const draftKey = (slug: string, eventId: number) => `ppd.pc.sheet.${slug}.${eventId}`

export interface Draft { state: SheetState; savedAt: string }

export function saveDraft(slug: string, eventId: number, state: SheetState): void {
  try {
    localStorage.setItem(draftKey(slug, eventId), JSON.stringify({ state, savedAt: new Date().toISOString() } satisfies Draft))
  } catch {
    /* almacenamiento lleno o bloqueado: se ignora */
  }
}

export function loadDraft(slug: string, eventId: number): Draft | null {
  try {
    const d = JSON.parse(localStorage.getItem(draftKey(slug, eventId)) ?? 'null') as Draft | null
    return d?.state?.lineup ? d : null
  } catch {
    return null
  }
}

export function clearDraft(slug: string, eventId: number): void {
  localStorage.removeItem(draftKey(slug, eventId))
}
