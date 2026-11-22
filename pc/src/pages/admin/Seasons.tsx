import { useState, type FormEvent } from 'react'
import { Pencil, Plus } from 'lucide-react'
import { fmt } from '../../lib/dates'
import { usePcMutation, useSeasons } from '../../lib/queries'
import type { Season } from '../../lib/types'
import { Modal } from '../../components/Modal'
import { Empty, ErrorAlert, Spinner, TextField, fieldError } from '../../components/ui'

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
              <div className="flex-1">
                <p className="font-semibold">{s.name} {s.is_current && <span className="chip ml-1 bg-org text-on-org">Actual</span>}</p>
                <p className="text-xs text-black/60">{d(s.starts_on)} – {d(s.ends_on)}</p>
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
        <label className="flex items-center gap-2"><input type="checkbox" className="size-5 accent-[var(--org-accent)]" checked={f.is_current} onChange={(e) => setF({ ...f, is_current: e.target.checked })} /> Temporada actual</label>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" disabled={m.isPending || f.name.trim().length < 2}>{m.isPending ? 'Guardando…' : 'Guardar'}</button>
        </div>
      </form>
    </Modal>
  )
}
