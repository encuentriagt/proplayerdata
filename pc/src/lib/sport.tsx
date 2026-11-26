import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Sport, Team } from './types'

interface SportContextValue {
  /** Deportes activados por la organización que el miembro ve (GET sports). */
  sports: Sport[]
  loading: boolean
  selected: Sport | null
  select: (id: number) => void
  /** Equipos del deporte elegido. */
  teams: Team[]
  teamIds: Set<number>
}

const SportContext = createContext<SportContextValue | null>(null)
const key = (slug: string) => `ppd.pc.sport.${slug}`

/** Deporte que se está viendo; se recuerda por organización en este navegador. */
export function SportProvider({ slug, sports, teams, loading, children }: { slug: string; sports: Sport[]; teams: Team[]; loading: boolean; children: ReactNode }) {
  const [selectedId, setSelectedId] = useState<number | null>(() => Number(localStorage.getItem(key(slug))) || null)
  const selected = sports.find((s) => s.id === selectedId) ?? sports[0] ?? null

  useEffect(() => {
    if (selected && selected.id !== selectedId) setSelectedId(selected.id)
  }, [selected, selectedId])

  const value = useMemo<SportContextValue>(() => {
    const sportTeams = selected ? teams.filter((t) => t.sport.id === selected.id) : []
    return {
      sports,
      loading,
      selected,
      select: (id) => { localStorage.setItem(key(slug), String(id)); setSelectedId(id) },
      teams: sportTeams,
      teamIds: new Set(sportTeams.map((t) => t.id)),
    }
  }, [sports, selected, teams, slug, loading])

  return <SportContext.Provider value={value}>{children}</SportContext.Provider>
}

export function useSport(): SportContextValue {
  const ctx = useContext(SportContext)
  if (!ctx) throw new Error('useSport fuera de SportProvider')
  return ctx
}
