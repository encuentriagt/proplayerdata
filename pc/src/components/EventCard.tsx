import { Link } from 'react-router-dom'
import { MapPin } from 'lucide-react'
import { capitalize, fmt } from '../lib/dates'
import { CHIP, EVENT_TYPE, EVENT_TYPE_COLOR, HOME_AWAY, eventTitle } from '../lib/labels'
import { useOrg } from '../lib/org'
import type { PcEvent } from '../lib/types'

/** ¿Partido ya jugado, publicado y sin resultado? */
export function isPendingSheet(ev: PcEvent): boolean {
  return ev.type === 'match' && !ev.is_draft && ev.status === 'scheduled' && !ev.result_published_at && !!ev.starts_at && new Date(ev.starts_at) < new Date()
}

/** Estado principal de la tarjeta (diseño "Tarjeta de actividad · estados"). */
function stateChip(ev: PcEvent): { label: string; cls: string } | null {
  if (ev.is_draft) return { label: 'No publicado', cls: CHIP.draft }
  if (ev.status === 'cancelled') return { label: 'Cancelado', cls: CHIP.cancelled }
  if (isPendingSheet(ev)) return { label: 'Ficha pendiente', cls: CHIP.pendingSheet }
  if (ev.time_pending) return { label: 'Hora por definir', cls: CHIP.timePending }
  return null
}

/**
 * Tarjeta de actividad.
 * - `line` (listas): "Sáb 29 nov · 10:00" arriba, título y lugar; estado a la derecha.
 * - `block` (Inicio): día grande y mes a la izquierda; tipo de actividad a la derecha.
 * Estados: borrador (gris punteado, "No publicado"), cancelado (tachado), ficha pendiente (ámbar), finalizado (marcador).
 */
export function EventCard({ ev, showDate = true, showType = true, variant = 'line' }: { ev: PcEvent; showDate?: boolean; showType?: boolean; variant?: 'line' | 'block' }) {
  const { slug } = useOrg()
  const cancelled = ev.status === 'cancelled'
  const chip = stateChip(ev)
  const pending = isPendingSheet(ev)
  const finished = ev.status === 'finished' && ev.score_us !== null
  // Si el estado principal ya es otro (p. ej. "No publicado"), "Hora por definir" va junto a la fecha.
  const when = !ev.starts_at ? 'Sin fecha' : ev.time_pending
    ? capitalize(fmt(ev.starts_at, 'EEE d MMM')) + (chip?.label === 'Hora por definir' ? '' : ' · Hora por definir')
    : showDate ? capitalize(fmt(ev.starts_at, "EEE d MMM '·' HH:mm")) : fmt(ev.starts_at, 'HH:mm')
  const surface = ev.is_draft
    ? 'bg-[#e4e2e1]! border border-dashed border-[#a39d9a]'
    : pending ? 'bg-warn-bg!' : ''

  if (variant === 'block') {
    const meta = [ev.starts_at && !ev.time_pending ? fmt(ev.starts_at, 'HH:mm') : 'Hora por definir', ev.location, ev.type === 'match' && ev.home_away ? HOME_AWAY[ev.home_away] : null]
      .filter(Boolean).join(' · ')
    return (
      <Link to={`/${slug}/eventos/${ev.id}`} className={`card flex items-center gap-4 px-4 py-3.5 transition hover:ring-2 hover:ring-org/30 ${surface}`}>
        <div className="w-11 shrink-0 text-center">
          {ev.starts_at ? (
            <>
              <p className="num text-3xl">{fmt(ev.starts_at, 'd')}</p>
              <p className="caps mt-0.5 text-[11px] tracking-[0.08em]">{fmt(ev.starts_at, 'MMM')}</p>
            </>
          ) : <p className="caps text-[11px]">Sin fecha</p>}
        </div>
        <div className="min-w-0 flex-1">
          <p className={`truncate font-semibold ${cancelled ? 'text-muted line-through' : ''}`}>{eventTitle(ev)}</p>
          <p className="truncate text-sm text-muted">{meta}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {showType && <span className={`chip ${EVENT_TYPE_COLOR[ev.type]}`}>{ev.type === 'training' ? 'Entreno' : EVENT_TYPE[ev.type]}</span>}
          {chip && <span className={`chip ${chip.cls}`}>{chip.label}</span>}
        </div>
      </Link>
    )
  }

  return (
    <Link to={`/${slug}/eventos/${ev.id}`} className={`card flex items-center gap-3 px-4 py-3.5 transition hover:ring-2 hover:ring-org/30 ${surface}`}>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className={`text-sm ${pending ? 'text-warn-ink' : 'text-muted'}`}>
            {when}
            {showType && <span className={`chip ml-2 align-middle ${EVENT_TYPE_COLOR[ev.type]}`}>{ev.type === 'training' ? 'Entreno' : EVENT_TYPE[ev.type]}</span>}
            {ev.team_name && ev.type !== 'match' && <span className="ml-1"> · {ev.team_name}</span>}
          </p>
          {chip && <span className={`chip shrink-0 ${chip.cls}`}>{chip.label}</span>}
        </div>
        <p className={`mt-0.5 truncate text-[17px] font-semibold ${cancelled ? 'text-muted line-through' : ''} ${ev.is_draft ? 'text-ink/70' : ''}`}>
          {eventTitle(ev)}
        </p>
        {(ev.location || (ev.type === 'match' && ev.home_away)) && (
          <p className="mt-0.5 flex items-center gap-1 truncate text-sm text-muted">
            <MapPin className="size-3.5 shrink-0" aria-hidden />
            {[ev.type === 'match' && ev.home_away ? HOME_AWAY[ev.home_away] : null, ev.location].filter(Boolean).join(' · ')}
          </p>
        )}
      </div>
      {finished && (
        <p className="num shrink-0 text-4xl" aria-label={`Marcador ${ev.score_us} a ${ev.score_them}`}>{ev.score_us}–{ev.score_them}</p>
      )}
    </Link>
  )
}
