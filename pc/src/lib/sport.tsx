import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Sport, Team } from './types'

// Ícono por código del catálogo. Los códigos son en inglés (soccer, futsal, basketball, volleyball,
// american_football, baseball…). Los códigos anteriores en español quedan como respaldo mientras el
// catálogo de la API termina de migrar. Si llega un deporte sin ícono, se usa la medalla.
const ICONS: Record<string, string> = {
  soccer: '⚽', futsal: '⚽', basketball: '🏀', volleyball: '🏐', beach_volleyball: '🏐', american_football: '🏈',
  baseball: '⚾', softball: '🥎', tennis: '🎾', table_tennis: '🏓', rugby: '🏉', handball: '🤾', field_hockey: '🏑',
  ice_hockey: '🏒', swimming: '🏊', athletics: '🏃', track_and_field: '🏃', chess: '♟️', badminton: '🏸', cycling: '🚴',
  // respaldo: códigos anteriores en español
  futbol: '⚽', futbol_sala: '⚽', basquetbol: '🏀', voleibol: '🏐', futbol_americano: '🏈', beisbol: '⚾',
}
export function sportIcon(code?: string | null): string {
  return (code && ICONS[code]) || '🏅'
}

interface SportContextValue {
  /** Deportes del colegio (hoy: los de sus equipos visibles). */
  sports: Sport[]
  selected: Sport | null
  select: (id: number) => void
  /** Equipos del deporte elegido. */
  teams: Team[]
  teamIds: Set<number>
}

const SportContext = createContext<SportContextValue | null>(null)
const key = (slug: string) => `ppd.pc.sport.${slug}`

/** Deporte que se está viendo; se recuerda por organización en este navegador. */
export function SportProvider({ slug, teams, children }: { slug: string; teams: Team[]; children: ReactNode }) {
  const sports = useMemo(() => {
    const m = new Map<number, Sport>()
    teams.forEach((t) => { if (!m.has(t.sport.id)) m.set(t.sport.id, t.sport) })
    return [...m.values()].sort((a, b) => a.name.localeCompare(b.name, 'es'))
  }, [teams])

  const [selectedId, setSelectedId] = useState<number | null>(() => Number(localStorage.getItem(key(slug))) || null)
  const selected = sports.find((s) => s.id === selectedId) ?? sports[0] ?? null

  useEffect(() => {
    if (selected && selected.id !== selectedId) setSelectedId(selected.id)
  }, [selected, selectedId])

  const value = useMemo<SportContextValue>(() => {
    const sportTeams = selected ? teams.filter((t) => t.sport.id === selected.id) : []
    return {
      sports,
      selected,
      select: (id) => { localStorage.setItem(key(slug), String(id)); setSelectedId(id) },
      teams: sportTeams,
      teamIds: new Set(sportTeams.map((t) => t.id)),
    }
  }, [sports, selected, teams, slug])

  return <SportContext.Provider value={value}>{children}</SportContext.Provider>
}

export function useSport(): SportContextValue {
  const ctx = useContext(SportContext)
  if (!ctx) throw new Error('useSport fuera de SportProvider')
  return ctx
}
