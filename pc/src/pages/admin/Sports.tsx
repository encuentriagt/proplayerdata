import { useEffect, useMemo, useState } from 'react'
import { Check } from 'lucide-react'
import { ApiError } from '../../lib/api'
import { usePcMutation, useOrgSports, useSports, useTeams } from '../../lib/queries'
import { SportIcon } from '../../components/SportIcon'
import { Alert, ErrorAlert, Spinner } from '../../components/ui'

/**
 * Administración → Deportes (solo con permissions.manage_sports).
 * El catálogo es de ppd; el admin solo activa los deportes que usa su colegio.
 */
export function AdminSports() {
  const catalog = useSports()
  const enabled = useOrgSports()
  const teams = useTeams()
  const [sel, setSel] = useState<number[]>([])
  const [ok, setOk] = useState(false)

  const initial = useMemo(() => (enabled.data ?? []).map((s) => s.id), [enabled.data])
  useEffect(() => setSel(initial), [initial])

  const teamsBySport = useMemo(() => {
    const m = new Map<number, number>()
    ;(teams.data ?? []).forEach((t) => m.set(t.sport.id, (m.get(t.sport.id) ?? 0) + 1))
    return m
  }, [teams.data])

  const save = usePcMutation<void>({
    method: 'PUT', path: 'sports', body: () => ({ sport_ids: sel }),
    // Cambia el selector, la creación de equipos y el alcance de directores.
    invalidate: [['sports'], ['teams'], ['members'], ['events']],
    onSuccess: () => setOk(true),
  })

  // 422 sport_in_use trae error.sport_ids con los deportes que no se pueden desactivar.
  const inUseIds = save.error instanceof ApiError && save.error.code === 'sport_in_use' ? (save.error.extra.sport_ids as number[] | undefined) ?? [] : []

  if (catalog.isLoading || enabled.isLoading) return <Spinner />
  if (catalog.isError) return <ErrorAlert error={catalog.error} />
  if (enabled.isError) return <ErrorAlert error={enabled.error} />

  const dirty = sel.length !== initial.length || sel.some((id) => !initial.includes(id))
  const toggle = (id: number, on: boolean) => { setOk(false); setSel((s) => (on ? [...s, id] : s.filter((x) => x !== id))) }

  return (
    <>
      <h2 className="title mb-1 text-2xl">Deportes</h2>
      <p className="mb-4 text-sm text-black/60">
        Active los deportes que usa su institución. Solo los activados aparecen en el selector de deporte, al crear equipos y al asignar directores técnicos.
        Las posiciones y estadísticas de cada deporte las define ppd.
      </p>
      {ok && <Alert tone="success">Deportes guardados.</Alert>}
      <ErrorAlert error={save.error} />

      <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {(catalog.data ?? []).map((s) => {
          const on = sel.includes(s.id)
          const nTeams = teamsBySport.get(s.id) ?? 0
          // Un deporte con equipos no se puede desactivar (la API responde sport_in_use).
          const locked = on && nTeams > 0 && initial.includes(s.id)
          return (
            <li key={s.id}>
              <label className={`card flex min-h-20 cursor-pointer items-center gap-3 p-3 ring-2 ${on ? 'ring-org' : 'ring-transparent'} ${locked ? 'cursor-default' : ''} ${inUseIds.includes(s.id) ? 'ring-red-600' : ''}`}>
                <input type="checkbox" className="sr-only" checked={on} disabled={locked} onChange={(e) => toggle(s.id, e.target.checked)} />
                <span className="grid size-12 shrink-0 place-items-center rounded-[12px] bg-org-soft text-org-accent"><SportIcon code={s.code} size={28} /></span>
                <span className="min-w-0 flex-1">
                  <span className="block font-bold">{s.name}</span>
                  <span className="text-xs text-black/60">
                    {nTeams > 0 ? `${nTeams} equipo${nTeams === 1 ? '' : 's'}${locked ? ' · no se puede desactivar' : ''}` : on ? 'Activado, sin equipos' : 'No activado'}
                  </span>
                </span>
                <span aria-hidden className={`grid size-7 place-items-center rounded-full ${on ? 'bg-org text-on-org' : 'ring-2 ring-black/20'}`}>
                  {on && <Check className="size-4" />}
                </span>
              </label>
            </li>
          )
        })}
      </ul>

      <div className="sticky bottom-0 -mx-4 mt-4 bg-ppd-bg/95 px-4 py-3 backdrop-blur">
        <button className="btn-primary" disabled={!dirty || save.isPending} onClick={() => { setOk(false); save.mutate() }}>
          {save.isPending ? 'Guardando…' : 'Guarde los deportes'}
        </button>
        <p className="mt-1 text-xs text-black/60">Al desactivar un deporte, también se quita del alcance de los directores técnicos.</p>
      </div>
    </>
  )
}
