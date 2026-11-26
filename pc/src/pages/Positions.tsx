import { useState, type FormEvent } from 'react'
import { ArrowDown, ArrowUp, Check, Pencil, Plus, Trash2, X } from 'lucide-react'
import { ApiError } from '../lib/api'
import { useOrg } from '../lib/org'
import { usePcMutation, useOrgSports } from '../lib/queries'
import { useSport } from '../lib/sport'
import type { Position } from '../lib/types'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { SportSwitcher } from '../components/SportSwitcher'
import { Alert, Empty, ErrorAlert, PageHeader, Spinner, TextField, fieldError } from '../components/ui'

/**
 * Posiciones del deporte elegido, propias del colegio (las comparten todos sus coaches de ese deporte).
 * Agregar, renombrar, ordenar y borrar (solo si ningún jugador la tiene en una plantilla activa).
 * Permiso: permissions.manage_positions incluye el deporte.
 */
export function PositionsPage() {
  const { can } = useOrg()
  const { selected } = useSport()
  const sports = useOrgSports()
  const sport = sports.data?.find((s) => s.id === selected?.id)
  const canEdit = !!selected && can.manage_positions.includes(selected.id)
  const positions = [...(sport?.positions ?? [])].sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0) || a.name.localeCompare(b.name, 'es'))

  const [name, setName] = useState('')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [deleting, setDeleting] = useState<Position | null>(null)

  const inval = [['sports'], ['team'], ['roster'], ['event']]
  const add = usePcMutation<void, Position>({
    method: 'POST', path: `sports/${selected?.id}/positions`, idempotent: true, body: () => ({ name: name.trim() }),
    invalidate: inval, onSuccess: () => setName(''),
  })
  const patch = usePcMutation<{ id: number; name?: string; sort?: number }, Position>({
    method: 'PATCH', path: (v) => `positions/${v.id}`, body: ({ id: _id, ...rest }) => rest,
    invalidate: inval, onSuccess: () => setEditingId(null),
  })
  const remove = usePcMutation<Position>({
    method: 'DELETE', path: (p) => `positions/${p.id}`, invalidate: inval, onSuccess: () => setDeleting(null),
  })

  // Reordenar: intercambia el orden con la vecina (dos PATCH).
  const move = async (i: number, dir: -1 | 1) => {
    const a = positions[i], b = positions[i + dir]
    if (!a || !b) return
    const sa = a.sort ?? i, sb = b.sort ?? i + dir
    await patch.mutateAsync({ id: a.id, sort: sb === sa ? sa + dir : sb })
    await patch.mutateAsync({ id: b.id, sort: sa })
  }

  const submit = (e: FormEvent) => { e.preventDefault(); if (name.trim() && !add.isPending) add.mutate() }
  const inUse = remove.error instanceof ApiError && remove.error.code === 'position_in_use'

  return (
    <>
      <PageHeader title="Posiciones" subtitle={selected ? `Las usan todos los coaches de ${selected.name} en su institución.` : undefined}
        actions={<SportSwitcher />} />

      {sports.isLoading ? <Spinner /> : sports.isError ? <ErrorAlert error={sports.error} /> : !sport ? (
        <Empty>Elija un deporte.</Empty>
      ) : (
        <div className="max-w-xl space-y-4">
          {!canEdit && <Alert tone="info">Puede ver las posiciones de {sport.name}, pero no editarlas.</Alert>}
          <ErrorAlert error={patch.error} />

          {positions.length ? (
            <ul className="card divide-y divide-black/5">
              {positions.map((p, i) => (
                <li key={p.id} className="flex items-center gap-2 p-2 pl-3">
                  {editingId === p.id ? (
                    <RenameRow position={p} busy={patch.isPending} error={patch.error}
                      onSave={(n) => patch.mutate({ id: p.id, name: n })} onCancel={() => setEditingId(null)} />
                  ) : (
                    <>
                      <span aria-hidden className="w-12 shrink-0 text-xs font-bold text-black/50">{p.code}</span>
                      <span className="min-w-0 flex-1 truncate font-semibold">{p.name}</span>
                      {canEdit && (
                        <>
                          <button className="btn-ghost size-10 p-0" disabled={i === 0 || patch.isPending} aria-label={`Subir ${p.name}`} onClick={() => void move(i, -1)}><ArrowUp className="size-4" aria-hidden /></button>
                          <button className="btn-ghost size-10 p-0" disabled={i === positions.length - 1 || patch.isPending} aria-label={`Bajar ${p.name}`} onClick={() => void move(i, 1)}><ArrowDown className="size-4" aria-hidden /></button>
                          <button className="btn-ghost size-10 p-0" aria-label={`Renombrar ${p.name}`} onClick={() => { patch.reset(); setEditingId(p.id) }}><Pencil className="size-4" aria-hidden /></button>
                          <button className="btn-ghost size-10 p-0 text-red-700" aria-label={`Borrar ${p.name}`} onClick={() => { remove.reset(); setDeleting(p) }}><Trash2 className="size-4" aria-hidden /></button>
                        </>
                      )}
                    </>
                  )}
                </li>
              ))}
            </ul>
          ) : <Empty>{sport.name} aún no tiene posiciones.</Empty>}

          {canEdit && (
            <form onSubmit={submit} className="card flex flex-wrap items-end gap-2 p-3" noValidate>
              <div className="min-w-48 flex-1">
                <TextField label="Nueva posición" placeholder="ej. Volante" value={name} maxLength={60}
                  onChange={(e) => setName(e.target.value)} error={fieldError(add.error, 'name') ?? fieldError(add.error, 'code')} />
              </div>
              <button className="btn-primary" disabled={!name.trim() || add.isPending}><Plus className="size-5" aria-hidden /> Agregar</button>
              {add.error instanceof ApiError && !Object.keys(add.error.fields).length && <div className="w-full"><ErrorAlert error={add.error} /></div>}
            </form>
          )}
          <p className="text-xs text-black/60">Las fichas de partidos pasados conservan el nombre de la posición aunque la cambie o la borre.</p>
        </div>
      )}

      <ConfirmDialog open={!!deleting} title={`¿Borrar la posición ${deleting?.name}?`} confirmLabel="Borrar" danger busy={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting)} onCancel={() => setDeleting(null)}>
        {inUse
          ? <Alert tone="warning">{(remove.error as ApiError).message}</Alert>
          : 'Solo se puede borrar si ningún jugador la tiene asignada en una plantilla.'}
        {!inUse && <ErrorAlert error={remove.error} />}
      </ConfirmDialog>
    </>
  )
}

function RenameRow({ position, busy, error, onSave, onCancel }: { position: Position; busy: boolean; error: unknown; onSave: (name: string) => void; onCancel: () => void }) {
  const [v, setV] = useState(position.name)
  return (
    <form className="flex flex-1 items-start gap-2" onSubmit={(e) => { e.preventDefault(); if (v.trim() && !busy) onSave(v.trim()) }}>
      <div className="flex-1">
        <input className="input" aria-label={`Nuevo nombre de ${position.name}`} value={v} maxLength={60} autoFocus onChange={(e) => setV(e.target.value)} />
        {fieldError(error, 'name') && <p className="mt-1 text-sm text-red-700">{fieldError(error, 'name')}</p>}
      </div>
      <button className="btn-primary size-11 p-0" disabled={!v.trim() || busy} aria-label="Guardar nombre"><Check className="size-5" aria-hidden /></button>
      <button type="button" className="btn-ghost size-11 p-0" aria-label="Cancelar" onClick={onCancel}><X className="size-5" aria-hidden /></button>
    </form>
  )
}
