import { useEffect, useMemo, useState } from 'react'
import { ATTENDANCE, ATTENDANCE_ORDER, normalizeAttendance } from '../../lib/labels'
import { usePcMutation, useRoster } from '../../lib/queries'
import type { AttendanceStatus, EventDetail } from '../../lib/types'
import { Check, X } from 'lucide-react'
import { Alert, Empty, ErrorAlert, Spinner } from '../../components/ui'
import { ConfirmDialog } from '../../components/ConfirmDialog'

export function AttendanceTab({ event }: { event: EventDetail }) {
  const roster = useRoster(event.team_id)
  const initial = useMemo(() => Object.fromEntries(event.attendance.map((a) => [a.player_id, normalizeAttendance(a.status)])) as Record<number, AttendanceStatus>, [event.attendance])
  // Sin clave = sin marcar. Se puede quitar una marca tocando de nuevo el botón elegido.
  const [sel, setSel] = useState<Partial<Record<number, AttendanceStatus>>>(initial)
  const [ok, setOk] = useState(false)
  const [confirm, setConfirm] = useState(false)
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
    onSuccess: () => { setOk(true); setConfirm(false) },
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
      {ok && (
        <Alert tone="success">
          {event.is_draft
            ? 'Asistencia guardada. Los padres la verán en la App cuando publique el partido.'
            : 'Asistencia guardada y publicada. Los padres ya la ven en la App.'}
        </Alert>
      )}
      <ErrorAlert error={save.error} />
      {/* Resumen en etiquetas de color (diseño) */}
      <p className="flex flex-wrap items-center gap-1.5 text-sm">
        {counts.map(([st, n]) => <span key={st} className={`chip px-2.5 py-1 text-[13px] ${ATTENDANCE[st].soft}`}><strong>{n}</strong> {ATTENDANCE[st].label}</span>)}
        <span className="ml-1 font-semibold text-muted">Sin marcar {missing}</span>
      </p>
      <button className="btn min-h-10 w-full border border-ink bg-transparent text-ink hover:bg-black/5" onClick={allPresent}>
        <Check className="size-4" aria-hidden /> Todos asisten
      </button>

      <ul className="space-y-2">
        {players.map((p) => (
          <li key={p.id} className="card flex items-center gap-3 px-3 py-2.5">
            <span className="num w-7 shrink-0 text-center text-2xl">{p.jersey_number ?? '–'}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{p.full_name}</p>
              <p className="truncate text-xs text-muted">{p.position?.name ?? 'Sin posición'}</p>
            </div>
            <div className="flex gap-1" role="group" aria-label={`Asistencia de ${p.full_name}`}>
              {(() => {
                const chosen = sel[p.id]
                // Elegido: un solo botón con el nombre completo y una ×; al tocarlo se quita la marca.
                if (chosen) {
                  return (
                    <button type="button" aria-pressed="true" aria-label={`${ATTENDANCE[chosen].label} (tocar para quitar)`}
                      onClick={() => set(p.id, chosen)}
                      className={`flex min-h-11 w-[11.75rem] items-center justify-between rounded-[10px] px-3.5 text-sm font-bold ${ATTENDANCE[chosen].cls}`}>
                      {ATTENDANCE[chosen].label}
                      <X className="size-4" aria-hidden />
                    </button>
                  )
                }
                return ATTENDANCE_ORDER.map((st) => (
                  <button key={st} type="button" aria-pressed="false" title={ATTENDANCE[st].label} aria-label={ATTENDANCE[st].label}
                    onClick={() => set(p.id, st)}
                    className={`size-11 rounded-[10px] border-[1.5px] bg-surface text-sm font-bold hover:bg-black/5 ${ATTENDANCE[st].outline}`}>
                    {ATTENDANCE[st].short}
                  </button>
                ))
              })()}
            </div>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted">A = asiste · NA = no asiste (con aviso) · L = lesión · NJ = no justificado</p>

      <div className="sticky bottom-0 -mx-4 bg-paper/95 px-4 py-3 backdrop-blur">
        <button className="btn-primary min-h-12 w-full sm:w-auto" disabled={!dirty || save.isPending || !hasChanges} onClick={() => (event.is_draft ? save.mutate() : (save.reset(), setConfirm(true)))}>
          {save.isPending ? 'Publicando…' : 'Guardar y publicar asistencia'}
        </button>
        {missing > 0 && <p className="mt-1 text-xs text-black/60">Faltan {missing} por marcar (se guardan solo los marcados).</p>}
      </div>

      <ConfirmDialog open={confirm} title="¿Enviar la asistencia?" confirmLabel="Enviar" busy={save.isPending}
        onConfirm={() => save.mutate()} onCancel={() => setConfirm(false)}>
        Se enviará un aviso a la App de los padres o encargados de cada jugador marcado ({Object.values(sel).filter(Boolean).length} jugador{Object.values(sel).filter(Boolean).length === 1 ? '' : 'es'}) con su asistencia.
        <ErrorAlert error={save.error} />
      </ConfirmDialog>
    </div>
  )
}
