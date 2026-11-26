import { Link } from 'react-router-dom'
import { addDays } from 'date-fns'
import { CalendarDays, Dumbbell, Shield, Trophy, Users } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { capitalize, fmt, nowGt, ymd } from '../lib/dates'
import { eventTitle } from '../lib/labels'
import type { PcEvent } from '../lib/types'
import { useOrg } from '../lib/org'
import { useEvents, usePendingSheets } from '../lib/queries'
import { useSport } from '../lib/sport'
import { SportSwitcher } from '../components/SportSwitcher'
import { EventCard } from '../components/EventCard'
import { Empty, ErrorAlert, Spinner } from '../components/ui'

export function Home() {
  const { slug } = useOrg()
  const { session } = useAuth()
  const today = nowGt()
  const { selected, sports, loading: sportsLoading } = useSport()
  const { can } = useOrg()
  // Sin deporte elegido no se pide nada (evita mezclar deportes).
  const events = useEvents({ from: ymd(today), to: ymd(addDays(today, 21)), sport_id: selected?.id ?? -1 })
  const pendingQ = usePendingSheets(selected?.id ?? -1)

  const now = Date.now()
  const pending = [...(pendingQ.data ?? [])].reverse() // el más reciente primero
  const upcoming = (events.data ?? []).filter((e) => e.status !== 'cancelled' && !!e.starts_at && new Date(e.starts_at).getTime() >= now).slice(0, 8)

  const first = session?.user.name.split(' ')[0] ?? ''

  return (
    <>
      {/* Fecha, saludo y, al otro lado, el deporte que se está viendo */}
      <div className="mb-6 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-muted">{capitalize(fmt(new Date(), "EEEE d 'de' MMMM"))}</p>
          <h1 className="title mt-1 text-[40px] sm:text-[56px]">Hola, {first}</h1>
        </div>
        <SportSwitcher size="lg" />
      </div>

      {/* Accesos: mosaicos con ícono (en el celular, ícono arriba y texto abajo) */}
      <nav aria-label="Accesos rápidos" className="mb-8 grid grid-cols-5 gap-2 sm:gap-3">
        <QuickLink to={`/${slug}/partidos`} Icon={Trophy} label="Partidos" />
        <QuickLink to={`/${slug}/entrenos`} Icon={Dumbbell} label="Entrenos" />
        <QuickLink to={`/${slug}/calendario`} Icon={CalendarDays} label="Calendario" />
        <QuickLink to={`/${slug}/equipos`} Icon={Shield} label="Equipos" />
        <QuickLink to={`/${slug}/jugadores`} Icon={Users} label="Jugadores" />
      </nav>

      {!sportsLoading && !sports.length && (
        <div className="mb-6">
          <Empty>
            Su organización aún no tiene deportes activados.{' '}
            {can.manage_sports
              ? <Link to={`/${slug}/admin/deportes`} className="font-semibold text-org-accent underline">Actívelos en Administración → Deportes</Link>
              : 'Consulte con el administrador de su institución.'}
          </Empty>
        </div>
      )}
      {!sports.length ? null : events.isLoading || pendingQ.isLoading ? <Spinner /> : events.isError || pendingQ.isError ? <ErrorAlert error={events.error ?? pendingQ.error} /> : (
        <div className="grid gap-8 lg:grid-cols-2">
          <section aria-labelledby="pend" className="min-w-0">
            <h2 id="pend" className="title mb-3 flex items-center gap-2 text-2xl">
              Fichas pendientes
              {pending.length > 0 && <span className="grid size-6 place-items-center rounded-full bg-ppd-star font-sans text-xs not-italic text-ink">{pending.length}</span>}
            </h2>
            {pending.length ? (
              <div className="space-y-3">{pending.map((e) => <PendingSheetCard key={e.id} ev={e} />)}</div>
            ) : <Empty>No tiene partidos pendientes de ficha.</Empty>}
          </section>
          <section aria-labelledby="prox" className="min-w-0">
            <h2 id="prox" className="title mb-3 text-2xl">Próximas actividades</h2>
            {upcoming.length ? (
              <div className="space-y-3">{upcoming.map((e) => <EventCard key={e.id} ev={e} variant="block" />)}</div>
            ) : <Empty>No hay actividades en las próximas tres semanas.</Empty>}
          </section>
        </div>
      )}
    </>
  )
}

function QuickLink({ to, Icon, label }: { to: string; Icon: typeof Trophy; label: string }) {
  return (
    <Link to={to} className="group flex flex-col items-center gap-1.5 rounded-[16px] text-center text-xs font-semibold sm:flex-row sm:gap-3 sm:bg-surface sm:p-3 sm:text-left sm:text-base sm:hover:ring-2 sm:hover:ring-org/30">
      <span className="grid size-12 shrink-0 place-items-center rounded-[12px] bg-org-soft text-org-accent group-hover:brightness-95">
        <Icon className="size-6" aria-hidden />
      </span>
      <span>{label}</span>
    </Link>
  )
}

/** Ficha pendiente (diseño): ámbar, con el resultado faltante y el botón "Llenar ficha". */
function PendingSheetCard({ ev }: { ev: PcEvent }) {
  const { slug } = useOrg()
  return (
    <div className="card flex items-center gap-3 bg-warn-bg! px-4 py-3.5">
      <Link to={`/${slug}/eventos/${ev.id}`} className="min-w-0 flex-1">
        <p className="font-semibold">{eventTitle(ev)}</p>
        <p className="text-sm text-warn-ink">{ev.starts_at ? `${capitalize(fmt(ev.starts_at, 'EEE d MMM'))} · ` : ''}Falta el resultado</p>
      </Link>
      <Link to={`/${slug}/eventos/${ev.id}?tab=ficha`} className="btn-primary min-h-10 shrink-0 px-4 text-sm">Llenar ficha</Link>
    </div>
  )
}
