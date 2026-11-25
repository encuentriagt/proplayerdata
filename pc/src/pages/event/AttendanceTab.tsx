import { useEffect, useMemo, useState } from 'react'
import { ATTENDANCE, ATTENDANCE_ORDER, normalizeAttendance } from '../../lib/labels'
import { usePcMutation, useRoster } from '../../lib/queries'
import type { AttendanceStatus, EventDetail } from '../../lib/types'
import { Alert, Avatar, Empty, ErrorAlert, Spinner } from '../../components/ui'

export function AttendanceTab({ event }: { event: EventDetail }) {
  const roster = useRoster(event.team_id)
  const initial = useMemo(() => Object.fromEntries(event.attendance.map((a) => [a.player_id, normalizeAttendance(a.status)])) as Record<number, AttendanceStatus>, [event.attendance])
  const [sel, setSel] = useState<Record<number, AttendanceStatus>>(initial)
  const [ok, setOk] = useState(false)
  useEffect(() => setSel(initial), [initial])

  const save = usePcMutation<void, { count: number }>({
    method: 'PUT', path: `events/${event.id}/attendance`, idempotent: true,
    body: () => ({ records: Object.entries(sel).map(([id, status]) => ({ player_id: Number(id), status })) }),
    invalidate: [['event', event.id]],
    onSuccess: () => setOk(true),
  })

  if (roster.isLoading) return <Spinner />
  if (roster.isError) return <ErrorAlert error={roster.error} />

  // Se listan los convocados si hay convocatoria; si no, la plantilla activa (más quien ya tenga registro).
  const calledIds = new Set(event.callups.map((c) => c.player_id))
  const players = (roster.data ?? []).filter((p) => (calledIds.size ? calledIds.has(p.id) : p.active) || initial[p.id])
  if (!players.length) return <Empty>No hay jugadores para tomar asistencia.</Empty>

  const set = (id: number, s: AttendanceStatus) => { setOk(false); setSel((m) => ({ ...m, [id]: s })) }
  const allPresent = () => { setOk(false); setSel(Object.fromEntries(players.map((p) => [p.id, 'present']))) }
  const dirty = players.some((p) => sel[p.id] !== initial[p.id])
  const missing = players.filter((p) => !sel[p.id]).length
  const counts = ATTENDANCE_ORDER.map((s) => [s, Object.values(sel).filter((v) => v === s).length] as const)

  return (
    <div className="space-y-3">
      {ok && <Alert tone="success">Asistencia guardada.</Alert>}
      <ErrorAlert error={save.error} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-black/70">
          {counts.map(([s, n]) => <span key={s} className="mr-3"><strong>{n}</strong> {ATTENDANCE[s].label}</span>)}
        </p>
        <button className="btn-secondary" onClick={allPresent}>Todos asisten</button>
      </div>

      <ul className="card divide-y divide-black/5">
        {players.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center gap-3 p-3">
            <Avatar name={p.full_name} url={p.photo_url} size={36} />
            <p className="min-w-0 flex-1 truncate font-semibold">
              {p.jersey_number !== null && <span className="text-black/50">#{p.jersey_number} </span>}{p.full_name}
            </p>
            <div className="flex gap-1" role="radiogroup" aria-label={`Asistencia de ${p.full_name}`}>
              {ATTENDANCE_ORDER.map((s) => (
                <button key={s} type="button" role="radio" aria-checked={sel[p.id] === s} title={ATTENDANCE[s].label} aria-label={ATTENDANCE[s].label}
                  onClick={() => set(p.id, s)}
                  className={`size-11 rounded-xl text-sm font-bold ring-1 ${sel[p.id] === s ? `${ATTENDANCE[s].cls} ring-transparent` : 'bg-white ring-black/15'}`}>
                  {ATTENDANCE[s].short}
                </button>
              ))}
            </div>
          </li>
        ))}
      </ul>
      <p className="text-xs text-black/60">A = asiste · NA = no asiste (con aviso) · L = lesión · NJ = no justificado</p>

      <div className="sticky bottom-0 -mx-4 bg-ppd-bg/95 px-4 py-3 backdrop-blur">
        <button className="btn-primary w-full sm:w-auto" disabled={!dirty || save.isPending || Object.keys(sel).length === 0} onClick={() => save.mutate()}>
          {save.isPending ? 'Guardando…' : 'Guarde la asistencia'}
        </button>
        {missing > 0 && <p className="mt-1 text-xs text-black/60">Faltan {missing} por marcar (se guardan solo los marcados).</p>}
      </div>
    </div>
  )
}
