import { useState } from 'react'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { CalendarX, MapPin, Pencil, Trash2 } from 'lucide-react'
import { capitalize, fmt } from '../lib/dates'
import { EVENT_STATUS, EVENT_TYPE, EVENT_TYPE_COLOR, HOME_AWAY, eventTitle } from '../lib/labels'
import { useOrg } from '../lib/org'
import { useEvent, usePcMutation } from '../lib/queries'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { Alert, ErrorAlert, Spinner } from '../components/ui'
import { CallupsTab } from './event/CallupsTab'
import { AttendanceTab } from './event/AttendanceTab'
import { MatchSheetTab } from './event/MatchSheetTab'

type Tab = 'convocatoria' | 'asistencia' | 'ficha'

export function EventDetailPage() {
  const { id } = useParams()
  const eventId = Number(id)
  const { slug } = useOrg()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const ev = useEvent(eventId)
  const [confirm, setConfirm] = useState<null | 'cancel' | 'delete'>(null)
  const saved = (useLocation().state as { saved?: 'published' | 'draft'; called?: number } | null) ?? null
  const [confirmPublish, setConfirmPublish] = useState(false)

  const cancel = usePcMutation({
    method: 'PATCH', path: `events/${eventId}`, body: () => ({ status: 'cancelled' }),
    invalidate: [['events'], ['event', eventId]], onSuccess: () => setConfirm(null),
  })
  const publish = usePcMutation({
    method: 'POST', path: `events/${eventId}/publish`, idempotent: true, body: () => ({}),
    invalidate: [['events'], ['event', eventId]], onSuccess: () => setConfirmPublish(false),
  })
  const remove = usePcMutation({
    method: 'DELETE', path: `events/${eventId}`, invalidate: [['events']],
    onSuccess: () => navigate(`/${slug}/calendario`, { replace: true }),
  })

  if (ev.isLoading) return <Spinner />
  if (ev.isError || !ev.data) return <ErrorAlert error={ev.error} />
  const e = ev.data

  const tabs: { key: Tab; label: string }[] = [
    { key: 'convocatoria', label: 'Convocatoria' },
    { key: 'asistencia', label: 'Asistencia' },
    ...(e.type === 'match' ? [{ key: 'ficha' as Tab, label: 'Ficha' }] : []),
  ]
  const isPast = new Date(e.starts_at) < new Date()
  const defaultTab: Tab = e.type === 'match' && isPast ? 'ficha' : isPast ? 'asistencia' : 'convocatoria'
  const requested = params.get('tab') as Tab | null
  const tab: Tab = requested && tabs.some((t) => t.key === requested) ? requested : defaultTab

  return (
    <>
      {saved && !(saved.saved === 'draft' && !e.is_draft) && (
        <div className="mb-4">
          {saved.saved === 'published' ? (
            <Alert tone="success">
              Partido publicado.{' '}
              {saved.called ? `Se avisó en la App a los padres de ${saved.called} convocado${saved.called === 1 ? '' : 's'}.` : 'Aún no tiene convocados: puede convocar desde la pestaña Convocatoria.'}
            </Alert>
          ) : (
            <Alert tone="info">Borrador guardado. No se avisó a nadie y los padres no lo ven en la App.</Alert>
          )}
        </div>
      )}
      {e.is_draft && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl bg-stone-200 p-3">
          <span className="chip bg-stone-600 text-white">No publicado</span>
          <p className="flex-1 text-sm">Es un borrador: los padres no lo ven en la App y no se ha avisado a nadie.</p>
          <button className="btn-primary" onClick={() => { publish.reset(); setConfirmPublish(true) }}>Publicar</button>
        </div>
      )}
      <div className="mb-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={`chip ${EVENT_TYPE_COLOR[e.type]}`}>{EVENT_TYPE[e.type]}</span>
          {e.team_name && <Link to={`/${slug}/equipos/${e.team_id}`} className="chip bg-black/5 text-ink hover:bg-black/10">{e.team_name}</Link>}
          <span className={`chip ${e.status === 'cancelled' ? 'bg-red-100 text-red-800' : e.status === 'finished' ? 'bg-emerald-100 text-emerald-800' : 'bg-black/5'}`}>
            {EVENT_STATUS[e.status]}
          </span>
        </div>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className={`title text-3xl sm:text-4xl ${e.status === 'cancelled' ? 'line-through opacity-60' : ''}`}>{eventTitle(e)}</h1>
            <p className="mt-1 text-black/70">
              {capitalize(fmt(e.starts_at, "EEEE d 'de' MMMM, HH:mm"))}
              {e.ends_at && ` – ${fmt(e.ends_at, 'HH:mm')}`}
              {e.home_away && e.type === 'match' && ` · ${HOME_AWAY[e.home_away]}`}
            </p>
            {e.location && <p className="flex items-center gap-1 text-black/60"><MapPin className="size-4" aria-hidden />{e.location}</p>}
          </div>
          {e.status === 'finished' && e.score_us !== null && (
            <p className="font-display text-5xl font-extrabold italic" aria-label={`Marcador ${e.score_us} a ${e.score_them}`}>{e.score_us}–{e.score_them}</p>
          )}
        </div>
        {e.notes && <p className="mt-2 whitespace-pre-line text-sm text-black/70">{e.notes}</p>}

        {e.status === 'scheduled' && (
          <div className="mt-3 flex flex-wrap gap-2">
            <Link to={`/${slug}/eventos/${e.id}/editar`} className="btn-secondary"><Pencil className="size-4" aria-hidden /> Editar</Link>
            <button className="btn-secondary" onClick={() => setConfirm('cancel')}><CalendarX className="size-4" aria-hidden /> Cancelar actividad</button>
            {!e.result_published_at && (
              <button className="btn-ghost text-red-700" onClick={() => setConfirm('delete')}><Trash2 className="size-4" aria-hidden /> Borrar</button>
            )}
          </div>
        )}
      </div>

      {e.status !== 'cancelled' && (
        <>
          <div role="tablist" aria-label="Secciones del evento" className="sticky top-[60px] z-10 -mx-4 mb-4 flex gap-1 overflow-x-auto bg-ppd-bg px-4 py-2 lg:top-0">
            {tabs.map((t) => (
              <button key={t.key} role="tab" aria-selected={tab === t.key} aria-controls={`panel-${t.key}`}
                onClick={() => setParams({ tab: t.key }, { replace: true })}
                className={`min-h-11 rounded-xl px-4 font-semibold ${tab === t.key ? 'bg-org text-on-org' : 'bg-white ring-1 ring-black/10'}`}>
                {t.label}
              </button>
            ))}
          </div>
          <div role="tabpanel" id={`panel-${tab}`}>
            {tab === 'convocatoria' && <CallupsTab event={e} />}
            {tab === 'asistencia' && <AttendanceTab event={e} />}
            {tab === 'ficha' && (e.is_draft
              ? <Alert tone="info">Publique el partido para poder llenar la ficha.</Alert>
              : <MatchSheetTab event={e} />)}
          </div>
        </>
      )}

      <ConfirmDialog open={confirmPublish} title="¿Publicar este partido?" confirmLabel="Publicar" busy={publish.isPending}
        onConfirm={() => publish.mutate()} onCancel={() => setConfirmPublish(false)}>
        Aparecerá en la App y se avisará a los padres de los {e.callups.filter((c) => c.status === 'called').length} convocados.
        <ErrorAlert error={publish.error} />
      </ConfirmDialog>
      <ConfirmDialog open={confirm === 'cancel'} title="¿Cancelar esta actividad?" confirmLabel="Sí, cancelar" danger
        busy={cancel.isPending} onConfirm={() => cancel.mutate()} onCancel={() => setConfirm(null)}>
        {e.is_draft ? 'Es un borrador: no se avisará a nadie.' : 'Se avisará a los padres de los jugadores convocados.'}
        <ErrorAlert error={cancel.error} />
      </ConfirmDialog>
      <ConfirmDialog open={confirm === 'delete'} title="¿Borrar esta actividad?" confirmLabel="Borrar" danger
        busy={remove.isPending} onConfirm={() => remove.mutate()} onCancel={() => setConfirm(null)}>
        Esta acción no se puede deshacer.
        <ErrorAlert error={remove.error} />
      </ConfirmDialog>
    </>
  )
}
