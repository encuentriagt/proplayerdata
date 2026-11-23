import { Link } from 'react-router-dom'
import { MapPin } from 'lucide-react'
import { fmt } from '../lib/dates'
import { EVENT_TYPE, EVENT_TYPE_COLOR, HOME_AWAY } from '../lib/labels'
import { useOrg } from '../lib/org'
import type { PcEvent } from '../lib/types'

/** `showType=false` en listas de un solo tipo (Partidos, Entrenos), donde la etiqueta sobra. */
export function EventCard({ ev, showDate = true, showType = true }: { ev: PcEvent; showDate?: boolean; showType?: boolean }) {
  const { slug } = useOrg()
  const cancelled = ev.status === 'cancelled'
  return (
    <Link to={`/${slug}/eventos/${ev.id}`} className="card flex items-stretch gap-3 p-3 transition hover:ring-2 hover:ring-org/40">
      <div className="w-14 shrink-0 text-center">
        {showDate && <p className="text-xs font-semibold uppercase text-black/60">{fmt(ev.starts_at, 'EEE d MMM')}</p>}
        <p className="font-display text-xl font-extrabold italic">{fmt(ev.starts_at, 'HH:mm')}</p>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          {showType && <span className={`chip ${EVENT_TYPE_COLOR[ev.type]}`}>{EVENT_TYPE[ev.type]}</span>}
          {ev.team_name && <span className="chip bg-black/5 text-ink">{ev.team_name}</span>}
          {cancelled && <span className="chip bg-red-100 text-red-800">Cancelado</span>}
          {ev.type === 'match' && ev.status === 'scheduled' && !ev.result_published_at && new Date(ev.starts_at) < new Date() && (
            <span className="chip bg-amber-100 text-amber-900">Ficha pendiente</span>
          )}
        </div>
        <p className={`mt-1 truncate font-semibold ${cancelled ? 'line-through text-black/50' : ''}`}>
          {ev.display_title}
          {ev.home_away && ev.type === 'match' && <span className="font-normal text-black/60"> · {HOME_AWAY[ev.home_away]}</span>}
        </p>
        {ev.location && (
          <p className="flex items-center gap-1 truncate text-sm text-black/60"><MapPin className="size-3.5 shrink-0" aria-hidden />{ev.location}</p>
        )}
      </div>
      {ev.status === 'finished' && ev.score_us !== null && (
        <div className="self-center text-right font-display text-2xl font-extrabold italic" aria-label={`Marcador ${ev.score_us} a ${ev.score_them}`}>
          {ev.score_us}–{ev.score_them}
        </div>
      )}
    </Link>
  )
}
