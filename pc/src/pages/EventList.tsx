import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useQueries } from '@tanstack/react-query'
import { addDays, format } from 'date-fns'
import { es } from 'date-fns/locale'
import { Plus } from 'lucide-react'
import { request } from '../lib/api'
import { capitalize, nowGt, toGt, ymd } from '../lib/dates'
import { pcPath, useOrg } from '../lib/org'
import { useTeams } from '../lib/queries'
import type { PcEvent } from '../lib/types'
import { EventCard } from '../components/EventCard'
import { Empty, ErrorAlert, PageHeader, Spinner } from '../components/ui'

type Kind = 'match' | 'training'
type Tab = 'proximos' | 'anteriores'

const TEXT: Record<Kind, { title: string; nuevo: string; ninguno: string; ningunoAntes: string }> = {
  match: { title: 'Partidos', nuevo: 'Nuevo partido', ninguno: 'No hay partidos programados.', ningunoAntes: 'No hay partidos anteriores en este periodo.' },
  training: { title: 'Entrenos', nuevo: 'Nuevo entreno', ninguno: 'No hay entrenos programados.', ningunoAntes: 'No hay entrenos anteriores en este periodo.' },
}

// La API permite consultar hasta 120 días por llamada: los anteriores se cargan por bloques de 120 días.
const WINDOW = 120

/** Lista de partidos o de entrenos (próximos y anteriores) con botón para agregar uno nuevo. */
export function EventList({ type }: { type: Kind }) {
  const { slug } = useOrg()
  const [params, setParams] = useSearchParams()
  const tab: Tab = params.get('ver') === 'anteriores' ? 'anteriores' : 'proximos'
  const teamId = Number(params.get('equipo')) || undefined
  const [blocks, setBlocks] = useState(1)
  const teams = useTeams()
  const t = TEXT[type]

  const set = (k: string, v?: string) => {
    const n = new URLSearchParams(params)
    v ? n.set(k, v) : n.delete(k)
    setParams(n, { replace: true })
    setBlocks(1)
  }

  const today = nowGt()
  const ranges = tab === 'proximos'
    ? [[today, addDays(today, WINDOW)]]
    : Array.from({ length: blocks }, (_, i) => [addDays(today, -WINDOW * (i + 1)), addDays(today, -WINDOW * i - 1)])

  const results = useQueries({
    queries: ranges.map(([from, to]) => {
      const query = { from: ymd(from), to: ymd(to), type, team_id: teamId }
      return {
        queryKey: [slug, 'events', query],
        queryFn: async () => (await request<PcEvent[]>(pcPath(slug, 'events'), { query })).data,
      }
    }),
  })

  const loading = results.some((r) => r.isLoading)
  const error = results.find((r) => r.isError)?.error
  // Próximos: de hoy en adelante (incluye lo de hoy aunque ya haya pasado la hora). Anteriores: hasta ayer, el más reciente primero.
  const all = results.flatMap((r) => r.data ?? [])
  const list = tab === 'proximos' ? all : [...all].sort((a, b) => b.starts_at.localeCompare(a.starts_at))

  // Agrupar por mes para que la lista se lea fácil.
  const groups = new Map<string, PcEvent[]>()
  list.forEach((e) => {
    const k = format(toGt(e.starts_at), 'yyyy-MM')
    groups.set(k, [...(groups.get(k) ?? []), e])
  })

  const nuevoHref = `/${slug}/eventos/nuevo?tipo=${type}${teamId ? `&equipo=${teamId}` : ''}`

  return (
    <>
      <PageHeader title={t.title} actions={
        <Link to={nuevoHref} className="btn-primary"><Plus className="size-5" aria-hidden /> {t.nuevo}</Link>
      } />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div role="tablist" aria-label="Periodo" className="flex rounded-xl bg-black/5 p-1">
          {([['proximos', 'Próximos'], ['anteriores', 'Anteriores']] as const).map(([k, label]) => (
            <button key={k} role="tab" aria-selected={tab === k} onClick={() => set('ver', k === 'proximos' ? undefined : k)}
              className={`min-h-10 rounded-lg px-4 text-sm font-semibold ${tab === k ? 'bg-white shadow' : ''}`}>{label}</button>
          ))}
        </div>
        <select className="input ml-auto min-h-10 w-auto py-1 text-sm" aria-label="Filtrar por equipo" value={teamId ?? ''}
          onChange={(e) => set('equipo', e.target.value || undefined)}>
          <option value="">Todos los equipos</option>
          {teams.data?.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </select>
      </div>

      {error ? <ErrorAlert error={error} /> : loading && !all.length ? <Spinner /> : !list.length ? (
        <Empty>
          {tab === 'proximos' ? t.ninguno : t.ningunoAntes}{' '}
          {tab === 'proximos' && <Link to={nuevoHref} className="font-semibold text-org-accent underline">{t.nuevo}</Link>}
        </Empty>
      ) : (
        <div className="space-y-5">
          {[...groups.entries()].map(([month, items]) => (
            <section key={month} aria-label={capitalize(format(toGt(items[0].starts_at), 'MMMM yyyy', { locale: es }))}>
              <h2 className="mb-2 text-sm font-bold uppercase text-black/60">{capitalize(format(toGt(items[0].starts_at), 'MMMM yyyy', { locale: es }))}</h2>
              <div className="space-y-2">{items.map((e) => <EventCard key={e.id} ev={e} showType={false} />)}</div>
            </section>
          ))}
        </div>
      )}

      {tab === 'anteriores' && !error && (
        <div className="mt-4 text-center">
          <button className="btn-secondary" disabled={loading} onClick={() => setBlocks((b) => b + 1)}>
            {loading ? 'Cargando…' : 'Ver más antiguos'}
          </button>
        </div>
      )}
    </>
  )
}
