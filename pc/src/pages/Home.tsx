import { Link } from 'react-router-dom'
import { addDays } from 'date-fns'
import { ClipboardList, Dumbbell, Shirt, Trophy, UserPlus } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { nowGt, ymd } from '../lib/dates'
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
  const upcoming = (events.data ?? []).filter((e) => e.status !== 'cancelled' && new Date(e.starts_at).getTime() >= now).slice(0, 8)

  const first = session?.user.name.split(' ')[0] ?? ''

  return (
    <>
      {/* Saludo a la izquierda y el deporte a la derecha, también en el celular */}
      <div className="mb-5">
        <div className="flex items-center justify-between gap-3">
          <h1 className="title min-w-0 text-3xl sm:text-4xl">Hola, {first}</h1>
          <SportSwitcher size="lg" />
        </div>
        <p className="mt-1 text-black/60">{selected ? `Esto es lo que viene en ${selected.name.toLowerCase()}.` : 'Esto es lo que viene para sus equipos.'}</p>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-5">
        <QuickLink to={`/${slug}/partidos`} Icon={Trophy} label="Partidos" />
        <QuickLink to={`/${slug}/entrenos`} Icon={Dumbbell} label="Entrenos" />
        <QuickLink to={`/${slug}/calendario`} Icon={ClipboardList} label="Calendario" />
        <QuickLink to={`/${slug}/equipos`} Icon={Shirt} label="Equipos" />
        <QuickLink to={`/${slug}/jugadores`} Icon={UserPlus} label="Jugadores" />
      </div>

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

function QuickLink({ to, Icon, label }: { to: string; Icon: typeof Trophy; label: string }) {
  return (
    <Link to={to} className="card flex min-h-20 flex-col items-center justify-center gap-1 p-3 text-center font-semibold hover:ring-2 hover:ring-org/40">
      <Icon className="size-6 text-org-accent" aria-hidden />
      <span className="text-sm">{label}</span>
    </Link>
  )
}
