import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Pencil, Plus, Trash2, Users } from 'lucide-react'
import { canCreateTeamInSport, canCreateTeams } from '../../lib/auth'
import { TEAM_GENDER } from '../../lib/labels'
import { useOrg } from '../../lib/org'
import { useMembers, useOrgSports, usePcMutation, useSeasons, useTeam, useTeams } from '../../lib/queries'
import type { Team } from '../../lib/types'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { Modal } from '../../components/Modal'
import { Empty, ErrorAlert, SelectField, Spinner, TextField, fieldError } from '../../components/ui'

export function AdminTeams() {
  const { slug, can } = useOrg()
  const teams = useTeams()
  const canCreate = canCreateTeams(can)
  const [editing, setEditing] = useState<Team | 'new' | null>(null)
  const [staffFor, setStaffFor] = useState<Team | null>(null)
  const [deleting, setDeleting] = useState<Team | null>(null)
  const remove = usePcMutation<Team>({ method: 'DELETE', path: (t) => `teams/${t.id}`, invalidate: [['teams']], onSuccess: () => setDeleting(null) })

  return (
    <>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="title text-2xl">Equipos</h2>
        {canCreate && <button className="btn-primary" onClick={() => setEditing('new')}><Plus className="size-5" aria-hidden /> Crear equipo</button>}
      </div>
      {teams.isLoading ? <Spinner /> : teams.isError ? <ErrorAlert error={teams.error} /> : !teams.data?.length ? <Empty>{canCreate ? 'Cree el primer equipo.' : 'No hay equipos en su alcance.'}</Empty> : (
        <ul className="card divide-y divide-black/5">
          {teams.data.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center gap-3 p-3">
              <span aria-hidden className="h-10 w-2 rounded-full" style={{ background: t.color ?? 'var(--org-primary)' }} />
              <Link to={`/${slug}/equipos/${t.id}`} className="min-w-0 flex-1 hover:underline">
                <span className="block truncate font-semibold">{t.name}</span>
                <span className="text-xs text-black/60">{[t.sport.name, t.category, t.gender && TEAM_GENDER[t.gender], t.season?.name].filter(Boolean).join(' · ')}</span>
              </Link>
              {t.can_manage && <div className="flex gap-1">
                <button className="btn-secondary min-h-9 text-sm" onClick={() => setStaffFor(t)}><Users className="size-4" aria-hidden /> Staff</button>
                <button className="btn-ghost min-h-9 px-2" aria-label={`Editar ${t.name}`} onClick={() => setEditing(t)}><Pencil className="size-4" aria-hidden /></button>
                <button className="btn-ghost min-h-9 px-2 text-red-700" aria-label={`Borrar ${t.name}`} onClick={() => setDeleting(t)}><Trash2 className="size-4" aria-hidden /></button>
              </div>}
            </li>
          ))}
        </ul>
      )}
      {editing && <TeamFormDialog team={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
      {staffFor && <StaffDialog team={staffFor} onClose={() => setStaffFor(null)} />}
      <ConfirmDialog open={!!deleting} title={`¿Borrar ${deleting?.name}?`} confirmLabel="Borrar" danger busy={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting)} onCancel={() => setDeleting(null)}>
        Sus actividades y estadísticas dejarán de mostrarse.
        <ErrorAlert error={remove.error} />
      </ConfirmDialog>
    </>
  )
}

function TeamFormDialog({ team, onClose }: { team?: Team; onClose: () => void }) {
  const { can } = useOrg()
  const sports = useOrgSports()
  // Solo deportes activados donde puede crear equipos ("all" = todos los activados). Al editar se conserva el actual.
  const sportOptions = (sports.data ?? []).filter((s) => canCreateTeamInSport(can, s.id) || s.id === team?.sport.id)
  const seasons = useSeasons()
  const current = seasons.data?.find((s) => s.is_current)
  const [f, setF] = useState({
    name: team?.name ?? '', sport_id: team?.sport.id ? String(team.sport.id) : '', season_id: team?.season?.id ? String(team.season.id) : '',
    category: team?.category ?? '', gender: team?.gender ?? '', color: team?.color ?? '#25984D',
  })
  const set = (k: keyof typeof f, v: string) => setF((s) => ({ ...s, [k]: v }))
  const seasonId = f.season_id || (!team && current ? String(current.id) : '')

  const body = () => ({
    name: f.name.trim(), sport_id: Number(f.sport_id), season_id: seasonId ? Number(seasonId) : null,
    category: f.category.trim() || null, gender: f.gender || null, color: f.color || null,
  })
  const create = usePcMutation({ method: 'POST', path: 'teams', idempotent: true, body, invalidate: [['teams']], onSuccess: onClose })
  const update = usePcMutation({ method: 'PATCH', path: `teams/${team?.id}`, body, invalidate: [['teams'], ['team', team?.id]], onSuccess: onClose })
  const m = team ? update : create
  const err = (k: string) => fieldError(m.error, k)
  const submit = (e: FormEvent) => { e.preventDefault(); if (!m.isPending) m.mutate() }

  return (
    <Modal title={team ? 'Editar equipo' : 'Nuevo equipo'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3" noValidate>
        <ErrorAlert error={m.error} />
        <TextField label="Nombre" value={f.name} onChange={(e) => set('name', e.target.value)} required minLength={2} maxLength={100} error={err('name')} autoFocus
          placeholder="ej. Sub-15 Masculino" />
        <SelectField label="Deporte" value={f.sport_id} onChange={(e) => set('sport_id', e.target.value)} required error={err('sport_id')}
          hint={team ? 'No se puede cambiar si el equipo ya tiene jugadores.' : undefined}>
          <option value="">Elija un deporte</option>
          {sportOptions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </SelectField>
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField label="Categoría" value={f.category} onChange={(e) => set('category', e.target.value)} maxLength={60} error={err('category')} placeholder="ej. Sub-15" />
          <SelectField label="Rama" value={f.gender} onChange={(e) => set('gender', e.target.value)} error={err('gender')}>
            <option value="">Sin indicar</option>
            {Object.entries(TEAM_GENDER).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </SelectField>
          <SelectField label="Temporada" value={seasonId} onChange={(e) => set('season_id', e.target.value)} error={err('season_id')}>
            <option value="">Sin temporada</option>
            {seasons.data?.map((s) => <option key={s.id} value={s.id}>{s.name}{s.is_current ? ' (actual)' : ''}</option>)}
          </SelectField>
          <TextField label="Color" type="color" value={f.color} onChange={(e) => set('color', e.target.value)} error={err('color')} className="input h-11 p-1" />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" disabled={m.isPending || f.name.trim().length < 2 || !f.sport_id}>{m.isPending ? 'Guardando…' : 'Guardar'}</button>
        </div>
      </form>
    </Modal>
  )
}

function StaffDialog({ team, onClose }: { team: Team; onClose: () => void }) {
  const { can } = useOrg()
  const detail = useTeam(team.id)
  const members = useMembers(can.manage_members)
  const [userId, setUserId] = useState('')
  const [role, setRole] = useState<'head_coach' | 'assistant'>('head_coach')
  const add = usePcMutation({
    method: 'POST', path: `teams/${team.id}/staff`, body: () => ({ user_id: Number(userId), role }),
    invalidate: [['team', team.id], ['members']], onSuccess: () => setUserId(''),
  })
  const remove = usePcMutation<number>({ method: 'DELETE', path: (uid) => `teams/${team.id}/staff/${uid}`, invalidate: [['team', team.id], ['members']] })

  const staffIds = new Set(detail.data?.staff.map((s) => s.user_id))
  // GET members ya viene filtrado por la API (el director solo recibe sus coaches); el director asigna solo coaches.
  const candidates = (members.data ?? [])
    .filter((m) => m.status === 'active' && !staffIds.has(m.user_id))
    .filter((m) => can.manage_directors || m.role === 'coach')
    .filter((m, i, arr) => arr.findIndex((x) => x.user_id === m.user_id) === i)

  return (
    <Modal title={`Staff de ${team.name}`} onClose={onClose}>
      <ErrorAlert error={add.error ?? remove.error} />
      {detail.isLoading ? <Spinner /> : (
        <ul className="mb-4 divide-y divide-black/5">
          {detail.data?.staff.length ? detail.data.staff.map((s) => (
            <li key={s.user_id} className="flex items-center gap-2 py-2">
              <span className="flex-1"><span className="font-semibold">{s.name}</span> <span className="text-sm text-black/60">· {s.role === 'head_coach' ? 'Coach principal' : 'Asistente'}</span></span>
              <button className="btn-ghost min-h-9 text-sm text-red-700" disabled={remove.isPending} onClick={() => remove.mutate(s.user_id)}>Quitar</button>
            </li>
          )) : <li className="py-2 text-sm text-black/60">Sin staff asignado.</li>}
        </ul>
      )}
      <div className="grid gap-2 sm:grid-cols-[1fr_10rem_auto] sm:items-end">
        <SelectField label="Agregar" value={userId} onChange={(e) => setUserId(e.target.value)}>
          <option value="">Elija un miembro</option>
          {candidates.map((m) => <option key={m.user_id} value={m.user_id}>{m.name} ({m.role_label})</option>)}
        </SelectField>
        <SelectField label="Función" value={role} onChange={(e) => setRole(e.target.value as typeof role)}>
          <option value="head_coach">Coach principal</option>
          <option value="assistant">Asistente</option>
        </SelectField>
        <button className="btn-primary" disabled={!userId || add.isPending} onClick={() => add.mutate()}>Asignar</button>
      </div>
      <p className="mt-2 text-xs text-black/60">{can.manage_directors ? '¿No aparece? Invítelo primero desde Miembros.' : '¿No aparece? Invite al coach desde Miembros; solo puede asignar coaches que usted administra.'}</p>
    </Modal>
  )
}
