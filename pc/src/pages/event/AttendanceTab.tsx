import { useEffect, useMemo, useState } from 'react'
import { ATTENDANCE, ATTENDANCE_ORDER, normalizeAttendance } from '../../lib/labels'
import { usePcMutation, useRoster } from '../../lib/queries'
import type { AttendanceStatus, EventDetail } from '../../lib/types'
import { Alert, Avatar, Empty, ErrorAlert, Spinner } from '../../components/ui'

export function AttendanceTab({ event }: { event: EventDetail }) {
  const roster = useRoster(event.team_id)
  const initial = useMemo(() => Object.fromEntries(event.attendance.map((a) => [a.player_id, normalizeAttendance(a.status)])) as Record<number, AttendanceStatus>, [event.attendance])
  // Sin clave = sin marcar. Se puede quitar una marca tocando de nuevo el botón elegido.
  const [sel, setSel] = useState<Partial<Record<number, AttendanceStatus>>>(initial)
  const [ok, setOk] = useState(false)
  useEffect(() => setSel(initial), [initial])

  const save = usePcMutation<void, { count: number }>({
    method: 'PUT', path: `events/${event.id}/attendance`, idempotent: true,
    // Marcados + los que tenían registro guardado y se desmarcaron (status: null = quitar el registro).
    body: () => ({
      records: [
        ...Object.entries(sel).filter(([, s]) => s).map(([id, status]) => ({ player_id: Number(id), status })),
        ...Object.keys(initial).filter((id) => !sel[Number(id)]).map((id) => ({ player_id: Number(id), status: null })),
      ],
    }),
    invalidate: [['event', event.id]],
    onSuccess: () => setOk(true),
  })

  if (roster.isLoading) return <Spinner />
  if (roster.isError) return <ErrorAlert error={roster.error} />

  // Se listan los convocados si hay convocatoria; si no, la plantilla activa (más quien ya tenga registro).
  const calledIds = new Set(event.callups.map((c) => c.player_id))
  const players = (roster.data ?? []).filter((p) => (calledIds.size ? calledIds.has(p.id) : p.active) || initial[p.id])
  if (!players.length) return <Empty>No hay jugadores para tomar asistencia.</Empty>

  // Tocar la opción elegida la quita (vuelven los 4 botones).
  const set = (id: number, s: AttendanceStatus) => {
    setOk(false)
    setSel((m) => {
      const next = { ...m }
      if (next[id] === s) delete next[id]
      else next[id] = s
      return next
    })
  }
  const allPresent = () => { setOk(false); setSel(Object.fromEntries(players.map((p) => [p.id, 'present']))) }
  const dirty = players.some((p) => sel[p.id] !== initial[p.id])
  const missing = players.filter((p) => !sel[p.id]).length
  const counts = ATTENDANCE_ORDER.map((s) => [s, Object.values(sel).filter((v) => v === s).length] as const)
  const hasChanges = Object.keys(sel).length > 0 || Object.keys(initial).length > 0

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
            <div className="flex gap-1" role="group" aria-label={`Asistencia de ${p.full_name}`}>
              {(() => {
                const chosen = sel[p.id]
                // Elegido: un solo botón con el nombre completo; al tocarlo se quita la marca.
                if (chosen) {
                  return (
                    <button type="button" aria-pressed="true" aria-label={`${ATTENDANCE[chosen].label} (tocar para quitar)`}
                      onClick={() => set(p.id, chosen)}
                      className={`min-h-11 min-w-[11.75rem] rounded-xl px-4 text-sm font-bold ${ATTENDANCE[chosen].cls}`}>
                      {ATTENDANCE[chosen].label}
                    </button>
                  )
                }
                return ATTENDANCE_ORDER.map((s) => (
                  <button key={s} type="button" aria-pressed="false" title={ATTENDANCE[s].label} aria-label={ATTENDANCE[s].label}
                    onClick={() => set(p.id, s)}
                    className="size-11 rounded-xl bg-white text-sm font-bold ring-1 ring-black/15 hover:bg-black/5">
                    {ATTENDANCE[s].short}
                  </button>
                ))
              })()}
            </div>
          </li>
        ))}
      </ul>
      <p className="text-xs text-black/60">A = asiste · NA = no asiste (con aviso) · L = lesión · NJ = no justificado</p>

      <div className="sticky bottom-0 -mx-4 bg-ppd-bg/95 px-4 py-3 backdrop-blur">
        <button className="btn-primary w-full sm:w-auto" disabled={!dirty || save.isPending || !hasChanges} onClick={() => save.mutate()}>
          {save.isPending ? 'Guardando…' : 'Guarde la asistencia'}
        </button>
        {missing > 0 && <p className="mt-1 text-xs text-black/60">Faltan {missing} por marcar (se guardan solo los marcados).</p>}
      </div>
    </div>
  )
}
