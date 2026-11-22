import { Link } from 'react-router-dom'
import { addDays } from 'date-fns'
import { CalendarPlus, ClipboardList, Shirt, UserPlus } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { nowGt, ymd } from '../lib/dates'
import { useOrg } from '../lib/org'
import { useEvents, usePendingSheets } from '../lib/queries'
import { EventCard } from '../components/EventCard'
import { Empty, ErrorAlert, PageHeader, Spinner } from '../components/ui'

export function Home() {
  const { slug } = useOrg()
  const { session } = useAuth()
  const today = nowGt()
  const events = useEvents({ from: ymd(today), to: ymd(addDays(today, 21)) })
  const pendingQ = usePendingSheets()

  const now = Date.now()
  const pending = [...(pendingQ.data ?? [])].reverse() // el más reciente primero
  const upcoming = (events.data ?? []).filter((e) => e.status !== 'cancelled' && new Date(e.starts_at).getTime() >= now).slice(0, 8)

  const first = session?.user.name.split(' ')[0] ?? ''

  return (
    <>
      <PageHeader title={`Hola, ${first}`} subtitle="Esto es lo que viene para sus equipos." />

      <div className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <QuickLink to={`/${slug}/eventos/nuevo`} Icon={CalendarPlus} label="Nueva actividad" />
        <QuickLink to={`/${slug}/calendario`} Icon={ClipboardList} label="Calendario" />
        <QuickLink to={`/${slug}/equipos`} Icon={Shirt} label="Equipos" />
        <QuickLink to={`/${slug}/jugadores`} Icon={UserPlus} label="Jugadores" />
      </div>

      {events.isLoading || pendingQ.isLoading ? <Spinner /> : events.isError || pendingQ.isError ? <ErrorAlert error={events.error ?? pendingQ.error} /> : (
        <div className="grid gap-6 lg:grid-cols-2">
          <section aria-labelledby="pend">
            <h2 id="pend" className="title mb-3 text-2xl">Fichas pendientes</h2>
            {pending.length ? (
              <div className="space-y-2">{pending.map((e) => <EventCard key={e.id} ev={e} />)}</div>
            ) : <Empty>No tiene partidos pendientes de ficha.</Empty>}
          </section>
          <section aria-labelledby="prox">
            <h2 id="prox" className="title mb-3 text-2xl">Próximas actividades</h2>
            {upcoming.length ? (
              <div className="space-y-2">{upcoming.map((e) => <EventCard key={e.id} ev={e} />)}</div>
            ) : <Empty>No hay actividades en las próximas tres semanas.</Empty>}
          </section>
        </div>
      )}
    </>
  )
}

function QuickLink({ to, Icon, label }: { to: string; Icon: typeof CalendarPlus; label: string }) {
  return (
    <Link to={to} className="card flex min-h-20 flex-col items-center justify-center gap-1 p-3 text-center font-semibold hover:ring-2 hover:ring-org/40">
      <Icon className="size-6 text-org-accent" aria-hidden />
      <span className="text-sm">{label}</span>
    </Link>
  )
}
