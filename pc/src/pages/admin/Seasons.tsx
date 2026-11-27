import { useState, type FormEvent } from 'react'
import { Pencil, Plus } from 'lucide-react'
import { fmt } from '../../lib/dates'
import { usePcMutation, useSeasonCycle, useSeasons } from '../../lib/queries'
import type { Season, SeasonProgress } from '../../lib/types'
import { Modal } from '../../components/Modal'
import { Alert, Empty, ErrorAlert, Spinner, TextField, fieldError } from '../../components/ui'

const d = (s: string | null) => (s ? fmt(`${s}T12:00:00-06:00`, "d MMM yyyy") : '…')

export function AdminSeasons() {
  const seasons = useSeasons()
  const [editing, setEditing] = useState<Season | 'new' | null>(null)
  const makeCurrent = usePcMutation<Season>({ method: 'PATCH', path: (s) => `seasons/${s.id}`, body: () => ({ is_current: true }), invalidate: [['seasons'], ['teams']] })

  return (
    <>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="title text-2xl">Temporadas</h2>
        <button className="btn-primary" onClick={() => setEditing('new')}><Plus className="size-5" aria-hidden /> Nueva temporada</button>
      </div>
      <ErrorAlert error={makeCurrent.error} />
      {seasons.isLoading ? <Spinner /> : seasons.isError ? <ErrorAlert error={seasons.error} /> : !seasons.data?.length ? <Empty>Aún no hay temporadas.</Empty> : (
        <ul className="card divide-y divide-black/5">
          {seasons.data.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center gap-3 p-3">
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-1.5 font-semibold">
                  {s.name}
                  {s.is_current && <span className="chip bg-org text-on-org">Actual</span>}
                  {s.cycle_label && <span className={`chip ${s.cycle === 'american' ? 'bg-info-bg text-info-ink' : 'bg-ok-bg text-ok'}`}>{s.cycle_label}</span>}
                </p>
                <p className="text-xs text-muted">{d(s.starts_on)} – {d(s.ends_on)}</p>
                {s.progress && <ProgressBar name={s.name} p={s.progress} />}
              </div>
              {!s.is_current && <button className="btn-secondary min-h-9 text-sm" disabled={makeCurrent.isPending} onClick={() => makeCurrent.mutate(s)}>Marcar como actual</button>}
              <button className="btn-ghost min-h-9 px-2" aria-label={`Editar ${s.name}`} onClick={() => setEditing(s)}><Pencil className="size-4" aria-hidden /></button>
            </li>
          ))}
        </ul>
      )}
      {editing && <SeasonDialog season={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    </>
  )
}

/** Avance de la temporada: barra + "49.6 % · faltan 184 días" / "Por empezar" / "Finalizada". */
export function ProgressBar({ name, p }: { name: string; p: SeasonProgress }) {
  const pct = Math.max(0, Math.min(100, p.status === 'upcoming' ? 0 : p.status === 'finished' ? 100 : p.percent_exact))
  const text = p.status === 'upcoming'
    ? `Por empezar · dura ${plural(p.days_total, 'día', 'días')}`
    : p.status === 'finished'
      ? 'Finalizada'
      : `${p.percent_exact.toLocaleString('en-US', { maximumFractionDigits: 1 })} % · ${p.days_left === 1 ? 'falta 1 día' : `faltan ${p.days_left} días`}`
  return (
    <div className="mt-2 max-w-md">
      <div className="h-2 overflow-hidden rounded-full bg-[#e4e2e1]" role="progressbar" aria-label={`Avance de ${name}`}
        aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} aria-valuetext={text}>
        <div className={`h-full rounded-full ${p.status === 'finished' ? 'bg-muted' : 'bg-org'}`} style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-1 text-xs font-semibold text-muted">{text}</p>
    </div>
  )
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

function SeasonDialog({ season, onClose }: { season?: Season; onClose: () => void }) {
  const [f, setF] = useState({ name: season?.name ?? '', starts_on: season?.starts_on ?? '', ends_on: season?.ends_on ?? '', is_current: season?.is_current ?? true })
  const body = () => ({ name: f.name.trim(), starts_on: f.starts_on || null, ends_on: f.ends_on || null, is_current: f.is_current })
  const create = usePcMutation({ method: 'POST', path: 'seasons', idempotent: true, body, invalidate: [['seasons']], onSuccess: onClose })
  const update = usePcMutation({ method: 'PATCH', path: `seasons/${season?.id}`, body, invalidate: [['seasons'], ['teams']], onSuccess: onClose })
  const m = season ? update : create
  const submit = (e: FormEvent) => { e.preventDefault(); if (!m.isPending) m.mutate() }

  return (
    <Modal title={season ? 'Editar temporada' : 'Nueva temporada'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3" noValidate>
        <ErrorAlert error={m.error} />
        <TextField label="Nombre" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required maxLength={60} placeholder="ej. 2027" error={fieldError(m.error, 'name')} autoFocus />
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField label="Inicio" type="date" value={f.starts_on} onChange={(e) => setF({ ...f, starts_on: e.target.value })} error={fieldError(m.error, 'starts_on')} />
          <TextField label="Fin" type="date" value={f.ends_on} onChange={(e) => setF({ ...f, ends_on: e.target.value })} error={fieldError(m.error, 'ends_on')} />
        </div>
        <CyclePreview starts_on={f.starts_on} ends_on={f.ends_on} />
        <label className="flex items-center gap-2"><input type="checkbox" className="size-5 accent-[var(--org-accent)]" checked={f.is_current} onChange={(e) => setF({ ...f, is_current: e.target.checked })} /> Temporada actual</label>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" disabled={m.isPending || f.name.trim().length < 2}>{m.isPending ? 'Guardando…' : 'Guardar'}</button>
        </div>
      </form>
    </Modal>
  )
}

/** Al elegir inicio y fin: "Empieza y termina en 2026: es ciclo guatemalteco." */
function CyclePreview({ starts_on, ends_on }: { starts_on: string; ends_on: string }) {
  const q = useSeasonCycle(starts_on, ends_on)
  if (!starts_on || !ends_on) return null
  if (q.isError) return <Alert tone="warning">{(q.error as Error).message || 'La fecha de fin debe ser después del inicio.'}</Alert>
  if (!q.data?.cycle_message) return null
  return <Alert tone="info" title={q.data.cycle_label ?? undefined}>{q.data.cycle_message}</Alert>
}
