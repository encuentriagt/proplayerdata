import { useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  addDays, addMonths, addWeeks, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameDay, isSameMonth,
  parseISO, startOfMonth, startOfWeek,
} from 'date-fns'
import { es } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { capitalize, nowGt, toGt, ymd } from '../lib/dates'
import { EVENT_TYPE, EVENT_TYPE_COLOR, eventTitle } from '../lib/labels'
import { useOrg } from '../lib/org'
import { useEvents } from '../lib/queries'
import { useSport } from '../lib/sport'
import { SportSwitcher } from '../components/SportSwitcher'
import type { EventType, PcEvent } from '../lib/types'
import { EventCard } from '../components/EventCard'
import { Empty, ErrorAlert, PageHeader, Spinner } from '../components/ui'

type View = 'mes' | 'semana' | 'lista'
const WEEK = { weekStartsOn: 1 as const }

export function Calendar() {
  const { slug } = useOrg()
  const [params, setParams] = useSearchParams()
  const view = (params.get('vista') as View) || (window.matchMedia?.('(min-width: 768px)').matches ? 'mes' : 'lista')
  const anchor = params.get('fecha') ? parseISO(params.get('fecha')!) : nowGt()
  const teamId = Number(params.get('equipo')) || undefined
  const type = (params.get('tipo') as EventType) || undefined

  const set = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams(params)
    Object.entries(patch).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)))
    setParams(next, { replace: true })
  }

  const [from, to] = useMemo(() => {
    if (view === 'semana') return [startOfWeek(anchor, WEEK), endOfWeek(anchor, WEEK)]
    if (view === 'mes') return [startOfWeek(startOfMonth(anchor), WEEK), endOfWeek(endOfMonth(anchor), WEEK)]
    return [startOfMonth(anchor), endOfMonth(anchor)]
  }, [view, anchor])

  const sport = useSport()
  const events = useEvents({ from: ymd(from), to: ymd(to), team_id: teamId, type, sport_id: sport.selected?.id ?? -1 })
  const shown = events.data ?? []

  const move = (dir: 1 | -1) => {
    const d = view === 'semana' ? addWeeks(anchor, dir) : addMonths(anchor, dir)
    set({ fecha: ymd(d) })
  }

  const label = view === 'semana'
    ? `${format(from, "d 'de' MMM", { locale: es })} – ${format(to, "d 'de' MMM yyyy", { locale: es })}`
    : capitalize(format(anchor, 'MMMM yyyy', { locale: es }))

  return (
    <>
      <PageHeader title="Calendario" actions={<>
        <SportSwitcher />
        <Link to={`/${slug}/eventos/nuevo${teamId ? `?equipo=${teamId}` : ''}`} className="btn-primary"><Plus className="size-5" aria-hidden /> Nueva actividad</Link>
      </>} />

      <div className="card mb-4 flex flex-wrap items-center gap-2 p-2">
        <div role="tablist" aria-label="Vista" className="flex rounded-xl bg-black/5 p-1">
          {(['mes', 'semana', 'lista'] as View[]).map((v) => (
            <button key={v} role="tab" aria-selected={view === v} onClick={() => set({ vista: v })}
              className={`rounded-lg px-3 py-1.5 text-sm font-semibold capitalize ${view === v ? 'bg-white shadow' : ''}`}>{v}</button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <button className="btn-ghost px-2" onClick={() => move(-1)} aria-label="Anterior"><ChevronLeft aria-hidden /></button>
          <button className="btn-ghost px-3 text-sm" onClick={() => set({ fecha: undefined })}>Hoy</button>
          <button className="btn-ghost px-2" onClick={() => move(1)} aria-label="Siguiente"><ChevronRight aria-hidden /></button>
        </div>
        <p className="font-semibold">{label}</p>
        <div className="ml-auto flex flex-wrap gap-2">
          <select className="input min-h-10 w-auto py-1 text-sm" aria-label="Filtrar por equipo" value={teamId ?? ''}
            onChange={(e) => set({ equipo: e.target.value || undefined })}>
            <option value="">Todos los equipos</option>
            {sport.teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <select className="input min-h-10 w-auto py-1 text-sm" aria-label="Filtrar por tipo" value={type ?? ''}
            onChange={(e) => set({ tipo: e.target.value || undefined })}>
            <option value="">Todos los tipos</option>
            {(Object.keys(EVENT_TYPE) as EventType[]).map((t) => <option key={t} value={t}>{EVENT_TYPE[t]}</option>)}
          </select>
        </div>
      </div>

      {events.isLoading ? <Spinner /> : events.isError ? <ErrorAlert error={events.error} /> : view === 'lista' ? (
        <ListView events={shown} />
      ) : (
        <GridView events={shown} from={from} to={to} anchor={anchor} compact={view === 'mes'} />
      )}
    </>
  )
}

function ListView({ events }: { events: PcEvent[] }) {
  if (!events.length) return <Empty>No hay actividades en este periodo.</Empty>
  const groups = new Map<string, PcEvent[]>()
  events.forEach((e) => {
    if (!e.starts_at) return
    const k = ymd(toGt(e.starts_at))
    groups.set(k, [...(groups.get(k) ?? []), e])
  })
  return (
    <div className="space-y-5">
      {[...groups.entries()].map(([day, list]) => (
        <section key={day}>
          <h2 className="mb-2 text-sm font-bold uppercase text-black/60">{capitalize(format(parseISO(day), "EEEE d 'de' MMMM", { locale: es }))}</h2>
          <div className="space-y-2">{list.map((e) => <EventCard key={e.id} ev={e} showDate={false} />)}</div>
        </section>
      ))}
    </div>
  )
}

function GridView({ events, from, to, anchor, compact }: { events: PcEvent[]; from: Date; to: Date; anchor: Date; compact: boolean }) {
  const { slug } = useOrg()
  const days = eachDayOfInterval({ start: from, end: to })
  const today = nowGt()
  const byDay = (d: Date) => events.filter((e) => e.starts_at && isSameDay(toGt(e.starts_at), d))
  const headers = eachDayOfInterval({ start: from, end: addDays(from, 6) })

  return (
    <div className="card overflow-hidden">
      <div className="grid grid-cols-7 border-b border-black/10 bg-black/[0.03] text-center text-xs font-bold uppercase text-black/60">
        {headers.map((d) => <div key={d.toISOString()} className="py-2">{format(d, 'EEE', { locale: es })}</div>)}
      </div>
      <div className="grid grid-cols-7">
        {days.map((d) => {
          const list = byDay(d)
          const outside = compact && !isSameMonth(d, anchor)
          return (
            <div key={d.toISOString()} className={`border-b border-r border-black/5 p-1 ${compact ? 'min-h-24' : 'min-h-64'} ${outside ? 'bg-black/[0.02] text-black/40' : ''}`}>
              <p className={`mb-1 grid size-7 place-items-center rounded-full text-sm font-semibold ${isSameDay(d, today) ? 'bg-org text-on-org' : ''}`}>{format(d, 'd')}</p>
              <ul className="space-y-1">
                {list.map((e) => (
                  <li key={e.id}>
                    <Link to={`/${slug}/eventos/${e.id}`} title={eventTitle(e)}
                      className={`block truncate rounded-md px-1.5 py-0.5 text-xs font-semibold ${EVENT_TYPE_COLOR[e.type]} ${e.status === 'cancelled' ? 'line-through opacity-50' : ''}`}>
                      {e.starts_at && !e.time_pending && format(toGt(e.starts_at), 'HH:mm')} {eventTitle(e)}
                      {e.status === 'finished' && e.score_us !== null && ` · ${e.score_us}–${e.score_them}`}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )
        })}
      </div>
    </div>
  )
}
