import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { CalendarPlus, Check, UserPlus, X } from 'lucide-react'
import { TEAM_GENDER } from '../lib/labels'
import { useOrg } from '../lib/org'
import { usePcMutation, usePlayers, useRoster, useTeam } from '../lib/queries'
import type { RosterEntry, TeamDetail } from '../lib/types'
import { Avatar, Empty, ErrorAlert, PageHeader, Spinner } from '../components/ui'
import { PlayerFormDialog } from './PlayerForm'
import { Modal } from '../components/Modal'

export function TeamDetailPage() {
  const { id } = useParams()
  const teamId = Number(id)
  const { slug } = useOrg()
  const team = useTeam(teamId)
  const roster = useRoster(teamId)
  const [adding, setAdding] = useState<null | 'new' | 'existing'>(null)
  const [showInactive, setShowInactive] = useState(false)

  if (team.isLoading) return <Spinner />
  if (team.isError || !team.data) return <ErrorAlert error={team.error} />
  const t = team.data
  const list = (roster.data ?? []).filter((p) => showInactive || p.active)
  const inactive = (roster.data ?? []).filter((p) => !p.active).length

  return (
    <>
      <PageHeader
        title={t.name}
        subtitle={[t.sport.name, t.category, t.gender && TEAM_GENDER[t.gender], t.season?.name].filter(Boolean).join(' · ')}
        actions={<>
          <Link to={`/${slug}/eventos/nuevo?equipo=${t.id}`} className="btn-secondary"><CalendarPlus className="size-5" aria-hidden /> Nueva actividad</Link>
          <Link to={`/${slug}/calendario?equipo=${t.id}&vista=lista`} className="btn-secondary">Calendario</Link>
        </>}
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
        <section aria-labelledby="roster-h">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 id="roster-h" className="title text-2xl">Plantilla <span className="text-base text-black/50">({(roster.data ?? []).filter((p) => p.active).length})</span></h2>
            <div className="flex gap-2">
              <button className="btn-secondary" onClick={() => setAdding('existing')}>Agregar existente</button>
              <button className="btn-primary" onClick={() => setAdding('new')}><UserPlus className="size-5" aria-hidden /> Nuevo jugador</button>
            </div>
          </div>
          {inactive > 0 && (
            <label className="mb-2 flex items-center gap-2 text-sm">
              <input type="checkbox" className="size-4" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
              Mostrar inactivos ({inactive})
            </label>
          )}
          {roster.isLoading ? <Spinner /> : roster.isError ? <ErrorAlert error={roster.error} /> : !list.length ? (
            <Empty>La plantilla está vacía. Agregue jugadores.</Empty>
          ) : (
            <ul className="card divide-y divide-black/5">
              {list.map((p) => <RosterRow key={p.id} team={t} p={p} />)}
            </ul>
          )}
        </section>

        <aside aria-labelledby="staff-h">
          <h2 id="staff-h" className="title mb-3 text-2xl">Staff</h2>
          {t.staff.length ? (
            <ul className="card divide-y divide-black/5">
              {t.staff.map((s) => (
                <li key={s.user_id} className="flex items-center gap-3 p-3">
                  <Avatar name={s.name ?? '?'} size={36} />
                  <div>
                    <p className="font-semibold">{s.name}</p>
                    <p className="text-xs text-black/60">{s.role === 'head_coach' ? 'Coach principal' : 'Asistente'}</p>
                  </div>
                </li>
              ))}
            </ul>
          ) : <Empty>Sin staff asignado.</Empty>}
        </aside>
      </div>

      {adding === 'new' && <PlayerFormDialog team={t} onClose={() => setAdding(null)} />}
      {adding === 'existing' && <AddExistingDialog team={t} roster={roster.data ?? []} onClose={() => setAdding(null)} />}
    </>
  )
}

function RosterRow({ team, p }: { team: TeamDetail; p: RosterEntry }) {
  const { slug } = useOrg()
  const [editing, setEditing] = useState(false)
  const [jersey, setJersey] = useState(p.jersey_number?.toString() ?? '')
  const [pos, setPos] = useState(p.position?.id?.toString() ?? '')

  const update = usePcMutation<Record<string, unknown>>({
    method: 'PATCH', path: `teams/${team.id}/roster/${p.id}`, body: (v) => v,
    invalidate: [['roster', team.id]], onSuccess: () => setEditing(false),
  })

  if (editing) {
    return (
      <li className="space-y-2 p-3">
        <p className="font-semibold">{p.full_name}</p>
        <div className="grid grid-cols-[6rem_1fr] gap-2">
          <label className="text-sm"><span className="label">Dorsal</span>
            <input className="input" type="number" inputMode="numeric" min={0} max={999} value={jersey} onChange={(e) => setJersey(e.target.value)} />
          </label>
          <label className="text-sm"><span className="label">Posición</span>
            <select className="input" value={pos} onChange={(e) => setPos(e.target.value)}>
              <option value="">Sin posición</option>
              {team.sport.positions.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </label>
        </div>
        <ErrorAlert error={update.error} />
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary" disabled={update.isPending}
            onClick={() => update.mutate({ jersey_number: jersey === '' ? null : Number(jersey), sport_position_id: pos ? Number(pos) : null })}>
            <Check className="size-4" aria-hidden /> Guardar
          </button>
          <button className="btn-secondary" onClick={() => update.mutate({ active: !p.active })} disabled={update.isPending}>
            {p.active ? 'Marcar inactivo' : 'Reactivar'}
          </button>
          <button className="btn-ghost" onClick={() => setEditing(false)}><X className="size-4" aria-hidden /> Cancelar</button>
        </div>
      </li>
    )
  }

  return (
    <li className={`flex items-center gap-3 p-3 ${p.active ? '' : 'opacity-60'}`}>
      <span className="w-10 text-center font-display text-2xl font-extrabold italic text-black/60">{p.jersey_number ?? '–'}</span>
      <Avatar name={p.full_name} url={p.photo_url} />
      <Link to={`/${slug}/jugadores/${p.id}`} className="min-w-0 flex-1 hover:underline">
        <span className="block truncate font-semibold">{p.full_name}</span>
        <span className="text-xs text-black/60">{p.position?.name ?? 'Sin posición'}{!p.active && ' · Inactivo'}</span>
      </Link>
      <button className="btn-ghost text-sm" onClick={() => setEditing(true)} aria-label={`Editar ${p.full_name} en la plantilla`}>Editar</button>
    </li>
  )
}

function AddExistingDialog({ team, roster, onClose }: { team: TeamDetail; roster: RosterEntry[]; onClose: () => void }) {
  const [search, setSearch] = useState('')
  const players = usePlayers({ search: search.trim() || undefined })
  const inRoster = new Set(roster.filter((r) => r.active).map((r) => r.id))
  const add = usePcMutation<number>({
    method: 'POST', path: `teams/${team.id}/roster`, body: (player_id) => ({ player_id }),
    invalidate: [['roster', team.id], ['players']],
  })

  return (
    <Modal title="Agregar jugador existente" onClose={onClose}>
      <input className="input" placeholder="Buscar por nombre o apellido" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Buscar jugador" autoFocus />
      <ErrorAlert error={add.error} />
      <ul className="mt-3 max-h-80 divide-y divide-black/5 overflow-y-auto">
        {players.isLoading ? <Spinner /> : players.data?.data.map((p) => (
          <li key={p.id} className="flex items-center gap-3 py-2">
            <Avatar name={p.full_name} url={p.photo_url} size={32} />
            <span className="flex-1 truncate">{p.full_name}</span>
            {inRoster.has(p.id) ? <span className="text-sm text-black/50">En el equipo</span> : (
              <button className="btn-secondary min-h-9 text-sm" disabled={add.isPending} onClick={() => add.mutate(p.id)}>Agregar</button>
            )}
          </li>
        ))}
      </ul>
    </Modal>
  )
}
