import { useEffect, useMemo, useState } from 'react'
import { CALLUP, GUARDIAN_RESPONSE } from '../../lib/labels'
import { usePcMutation, useRoster } from '../../lib/queries'
import type { CallupStatus, EventDetail } from '../../lib/types'
import { Alert, Avatar, Empty, ErrorAlert, Spinner } from '../../components/ui'

type Choice = CallupStatus | 'none'

export function CallupsTab({ event }: { event: EventDetail }) {
  const roster = useRoster(event.team_id)
  const initial = useMemo(() => {
    const m: Record<number, Choice> = {}
    event.callups.forEach((c) => { m[c.player_id] = c.status })
    return m
  }, [event.callups])
  const [sel, setSel] = useState<Record<number, Choice>>(initial)
  const [saved, setSaved] = useState<number[] | null>(null)
  useEffect(() => setSel(initial), [initial])

  const save = usePcMutation<void, { count: number; newly_called: number[] }>({
    method: 'PUT', path: `events/${event.id}/callups`, idempotent: true,
    body: () => ({
      players: Object.entries(sel).filter(([, s]) => s !== 'none').map(([id, status]) => ({ player_id: Number(id), status })),
    }),
    invalidate: [['event', event.id]],
    onSuccess: (r) => setSaved(r.newly_called),
  })

  if (roster.isLoading) return <Spinner />
  if (roster.isError) return <ErrorAlert error={roster.error} />
  const active = (roster.data ?? []).filter((p) => p.active)
  if (!active.length) return <Empty>El equipo no tiene jugadores activos.</Empty>

  const closed = event.status !== 'scheduled'
  const responses = new Map(event.callups.map((c) => [c.player_id, c.guardian_response]))
  const dirty = active.some((p) => (sel[p.id] ?? 'none') !== (initial[p.id] ?? 'none'))
  const called = Object.values(sel).filter((s) => s === 'called').length
  const reserve = Object.values(sel).filter((s) => s === 'reserve').length

  const setAll = (c: Choice) => setSel(Object.fromEntries(active.map((p) => [p.id, c])))
  const pick = (id: number, c: Choice) => { setSaved(null); setSel((s) => ({ ...s, [id]: s[id] === c ? 'none' : c })) }

  return (
    <div className="space-y-3">
      {closed && <Alert tone="info">Solo se puede convocar a actividades programadas.</Alert>}
      {saved && (
        <Alert tone="success">
          Convocatoria guardada.{saved.length > 0 && ` Se avisó a los padres de ${saved.length} jugador${saved.length === 1 ? '' : 'es'}.`}
        </Alert>
      )}
      <ErrorAlert error={save.error} />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-black/70"><strong>{called}</strong> convocados · <strong>{reserve}</strong> reservas</p>
        {!closed && (
          <div className="flex gap-2">
            <button className="btn-ghost text-sm" onClick={() => setAll('called')}>Convocar a todos</button>
            <button className="btn-ghost text-sm" onClick={() => setAll('none')}>Quitar todos</button>
          </div>
        )}
      </div>

      <ul className="card divide-y divide-black/5">
        {active.map((p) => {
          const c = sel[p.id] ?? 'none'
          const resp = responses.get(p.id)
          return (
            <li key={p.id} className="flex flex-wrap items-center gap-3 p-3">
              <Avatar name={p.full_name} url={p.photo_url} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{p.jersey_number !== null && <span className="text-black/50">#{p.jersey_number} </span>}{p.full_name}</p>
                <p className="text-xs text-black/60">
                  {p.position?.name ?? 'Sin posición'}
                  {resp && initial[p.id] && <span className={`chip ml-2 ${GUARDIAN_RESPONSE[resp].cls}`}>{GUARDIAN_RESPONSE[resp].label}</span>}
                </p>
              </div>
              <div className="flex gap-1" role="group" aria-label={`Convocatoria de ${p.full_name}`}>
                {(['called', 'reserve'] as CallupStatus[]).map((s) => (
                  <button key={s} type="button" disabled={closed} aria-pressed={c === s} onClick={() => pick(p.id, s)}
                    className={`min-h-11 rounded-xl px-3 text-sm font-semibold ring-1 ${c === s ? (s === 'called' ? 'bg-org text-on-org ring-org' : 'bg-amber-400 text-ink ring-amber-400') : 'bg-white ring-black/15'}`}>
                    {CALLUP[s]}
                  </button>
                ))}
              </div>
            </li>
          )
        })}
      </ul>

      {!closed && (
        <div className="sticky bottom-0 -mx-4 bg-ppd-bg/95 px-4 py-3 backdrop-blur">
          <button className="btn-primary w-full sm:w-auto" disabled={!dirty || save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? 'Guardando…' : 'Guarde la convocatoria'}
          </button>
          <p className="mt-1 text-xs text-black/60">Al guardar se avisa a los padres de los nuevos convocados.</p>
        </div>
      )}
    </div>
  )
}
