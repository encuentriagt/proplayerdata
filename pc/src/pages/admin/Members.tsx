import { useState, type FormEvent } from 'react'
import { KeyRound, Target, UserPlus } from 'lucide-react'
import { ApiError } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { fmt } from '../../lib/dates'
import { ROLE_LABEL } from '../../lib/labels'
import { useOrg } from '../../lib/org'
import { useMembers, usePcMutation, useSports, useTeams } from '../../lib/queries'
import type { Member, Role } from '../../lib/types'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { InviteLink, ResetLink } from '../../components/InviteLink'
import { Modal } from '../../components/Modal'
import { Avatar, Empty, ErrorAlert, SelectField, Spinner, TextField, fieldError } from '../../components/ui'

const STATUS = { active: ['Activo', 'bg-emerald-100 text-emerald-800'], invited: ['Invitado', 'bg-sky-100 text-sky-800'], disabled: ['Desactivado', 'bg-stone-200 text-stone-700'] } as const

// La API ya filtra: el admin recibe a todos; el director técnico solo a los coaches que administra.
export function AdminMembers() {
  const { can, branding } = useOrg()
  const members = useMembers()
  const { session } = useAuth()
  const [inviting, setInviting] = useState(false)
  const [removing, setRemoving] = useState<Member | null>(null)
  const [resetFor, setResetFor] = useState<Member | null>(null)
  const [scopeFor, setScopeFor] = useState<Member | null>(null)
  const staffRoles = can.invite_roles.filter((r): r is Role => r !== 'guardian')

  const toggle = usePcMutation<Member>({
    method: 'PATCH', path: (m) => `members/${m.id}`, body: (m) => ({ status: m.status === 'disabled' ? 'active' : 'disabled' }),
    invalidate: [['members']],
  })
  const remove = usePcMutation<Member>({
    method: 'DELETE', path: (m) => `members/${m.id}`, invalidate: [['members'], ['teams']], onSuccess: () => setRemoving(null),
  })
  const reset = usePcMutation<Member, { reset_url: string; expires_at: string }>({
    method: 'POST', path: (m) => `members/${m.id}/reset-password`, body: () => ({}),
  })

  return (
    <>
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <h2 className="title text-2xl">{can.manage_directors ? 'Miembros' : 'Mis coaches'}</h2>
          {!can.manage_directors && <p className="text-sm text-black/60">Coaches cuyos equipos están dentro de su alcance.</p>}
        </div>
        {staffRoles.length > 0 && (
          <button className="btn-primary" onClick={() => setInviting(true)}><UserPlus className="size-5" aria-hidden /> Invitar {can.manage_directors ? 'miembro' : 'coach'}</button>
        )}
      </div>
      <ErrorAlert error={toggle.error} />
      {members.isLoading ? <Spinner /> : members.isError ? <ErrorAlert error={members.error} /> : !members.data?.length ? (
        <Empty>{can.manage_directors ? 'Sin miembros.' : 'Aún no administra coaches. Invite uno y asígnele equipos de su alcance.'}</Empty>
      ) : (
        <ul className="card divide-y divide-black/5">
          {members.data.map((m) => {
            const self = m.user_id === session?.user.id
            const [label, cls] = STATUS[m.status]
            return (
              <li key={m.id} className="flex flex-wrap items-center gap-3 p-3">
                <Avatar name={m.name ?? '?'} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{m.name}{self && <span className="font-normal text-black/50"> (usted)</span>}</p>
                  <p className="truncate text-xs text-black/60">{m.email}</p>
                  <p className="mt-1 flex flex-wrap gap-1">
                    <span className="chip bg-black/5">{m.role_label}</span>
                    <span className={`chip ${cls}`}>{label}</span>
                    {m.teams.map((t) => <span key={t.id} className="chip bg-org/10">{t.name}</span>)}
                  </p>
                  {m.role === 'director' && m.director_scope && (
                    <p className="mt-1 text-xs text-black/70">
                      <span className="font-semibold">Alcance: </span>
                      {[...m.director_scope.sports.map((s) => `${s.name} (todo el deporte)`), ...m.director_scope.teams.map((t) => t.name)].join(' · ') || 'sin asignar'}
                    </p>
                  )}
                  {m.last_login_at && <p className="mt-1 text-xs text-black/50">Último ingreso: {fmt(m.last_login_at, 'd MMM yyyy, HH:mm')}</p>}
                </div>
                {!self && (
                  <div className="flex flex-wrap gap-1">
                    {m.role === 'director' && can.manage_directors && (
                      <button className="btn-secondary min-h-9 text-sm" onClick={() => setScopeFor(m)}><Target className="size-4" aria-hidden /> Asignar deportes/equipos</button>
                    )}
                    {m.status === 'active' && (
                      <button className="btn-ghost min-h-9 px-2" title="Enlace para nueva contraseña" aria-label={`Enlace para nueva contraseña de ${m.name}`}
                        onClick={() => { reset.reset(); setResetFor(m) }}><KeyRound className="size-4" aria-hidden /></button>
                    )}
                    <button className="btn-secondary min-h-9 text-sm" disabled={toggle.isPending} onClick={() => toggle.mutate(m)}>
                      {m.status === 'disabled' ? 'Reactivar' : 'Desactivar'}
                    </button>
                    <button className="btn-ghost min-h-9 text-sm text-red-700" onClick={() => setRemoving(m)}>Quitar</button>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {inviting && <InviteMemberDialog roles={staffRoles} onClose={() => setInviting(false)} />}
      {scopeFor && <ScopeDialog member={scopeFor} onClose={() => setScopeFor(null)} />}
      {resetFor && (
        <Modal title={`Nueva contraseña para ${resetFor.name}`} onClose={() => setResetFor(null)}>
          {reset.data ? (
            <>
              <ResetLink url={reset.data.reset_url} orgName={branding.name} />
              <button className="btn-primary mt-4 w-full" onClick={() => setResetFor(null)}>Listo</button>
            </>
          ) : (
            <div className="space-y-3">
              <p>Se creará un enlace para que {resetFor.name} elija una nueva contraseña. Compártalo solo con esa persona.</p>
              <ErrorAlert error={reset.error} />
              <div className="flex justify-end gap-2">
                <button className="btn-secondary" onClick={() => setResetFor(null)}>Cancelar</button>
                <button className="btn-primary" disabled={reset.isPending} onClick={() => reset.mutate(resetFor)}>{reset.isPending ? 'Generando…' : 'Crear enlace'}</button>
              </div>
            </div>
          )}
        </Modal>
      )}
      <ConfirmDialog open={!!removing} title={`¿Quitar a ${removing?.name}?`} confirmLabel="Quitar" danger busy={remove.isPending}
        onConfirm={() => removing && remove.mutate(removing)} onCancel={() => setRemoving(null)}>
        {removing?.role === 'director' ? 'Perderá el rol de director técnico y su alcance.' : `Perderá el rol de ${removing?.role_label.toLowerCase()} y sus equipos asignados.`}
        <ErrorAlert error={remove.error} />
      </ConfirmDialog>
    </>
  )
}

/** Deportes (catálogo) y equipos sueltos, con casillas. Se usa al invitar un director y al asignar su alcance. */
function ScopePicker({ sportIds, teamIds, onSports, onTeams, error }: {
  sportIds: number[]; teamIds: number[]; onSports: (ids: number[]) => void; onTeams: (ids: number[]) => void; error?: string
}) {
  const sports = useSports()
  const teams = useTeams()
  const toggle = (ids: number[], id: number, on: boolean) => (on ? [...ids, id] : ids.filter((x) => x !== id))
  // Un equipo de un deporte ya elegido completo queda incluido: no hace falta marcarlo aparte.
  const looseTeams = (teams.data ?? []).filter((t) => !sportIds.includes(t.sport.id))
  return (
    <div className="space-y-3">
      <fieldset>
        <legend className="label">Deportes completos</legend>
        <p className="mb-1 text-xs text-black/60">Incluye todos sus equipos, también los que se creen después.</p>
        <div className="flex flex-wrap gap-2">
          {sports.data?.map((s) => (
            <label key={s.id} className={`flex min-h-10 cursor-pointer items-center gap-2 rounded-xl px-3 ring-1 ${sportIds.includes(s.id) ? 'bg-org/10 ring-org' : 'ring-black/15'}`}>
              <input type="checkbox" className="size-5 accent-[var(--org-accent)]" checked={sportIds.includes(s.id)}
                onChange={(e) => {
                  const next = toggle(sportIds, s.id, e.target.checked)
                  onSports(next)
                  // Los equipos de un deporte elegido completo ya están incluidos: se quitan de "sueltos".
                  const covered = new Set((teams.data ?? []).filter((t) => next.includes(t.sport.id)).map((t) => t.id))
                  if (teamIds.some((id) => covered.has(id))) onTeams(teamIds.filter((id) => !covered.has(id)))
                }} />
              {s.name}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="label">Equipos sueltos</legend>
        {looseTeams.length ? (
          <div className="max-h-44 space-y-1 overflow-y-auto rounded-xl border border-black/10 p-2">
            {looseTeams.map((t) => (
              <label key={t.id} className="flex min-h-10 items-center gap-2">
                <input type="checkbox" className="size-5 accent-[var(--org-accent)]" checked={teamIds.includes(t.id)}
                  onChange={(e) => onTeams(toggle(teamIds, t.id, e.target.checked))} />
                {t.name} <span className="text-xs text-black/50">· {t.sport.name}</span>
              </label>
            ))}
          </div>
        ) : <p className="text-sm text-black/60">No hay más equipos fuera de los deportes elegidos.</p>}
      </fieldset>
      {error && <p className="text-sm text-red-700">{error}</p>}
    </div>
  )
}

function ScopeDialog({ member, onClose }: { member: Member; onClose: () => void }) {
  const [sportIds, setSportIds] = useState(member.director_scope?.sports.map((s) => s.id) ?? [])
  const [teamIds, setTeamIds] = useState(member.director_scope?.teams.map((t) => t.id) ?? [])
  const save = usePcMutation({
    method: 'PUT', path: `members/${member.id}/scopes`,
    body: () => ({ sport_ids: sportIds, team_ids: teamIds }),
    invalidate: [['members']], onSuccess: onClose,
  })
  return (
    <Modal title={`Alcance de ${member.name}`} onClose={onClose}>
      <p className="mb-3 text-sm text-black/70">El director técnico solo verá y manejará lo que marque aquí.</p>
      <ScopePicker sportIds={sportIds} teamIds={teamIds} onSports={setSportIds} onTeams={setTeamIds}
        error={fieldError(save.error, 'sport_ids') ?? fieldError(save.error, 'team_ids')} />
      {!(save.error instanceof ApiError && Object.keys(save.error.fields).length) && <div className="mt-3"><ErrorAlert error={save.error} /></div>}
      {!sportIds.length && !teamIds.length && <p className="mt-3 text-sm text-amber-900">Sin alcance, el director no verá ningún equipo.</p>}
      <div className="mt-4 flex justify-end gap-2">
        <button className="btn-secondary" onClick={onClose}>Cancelar</button>
        <button className="btn-primary" disabled={save.isPending} onClick={() => save.mutate()}>{save.isPending ? 'Guardando…' : 'Guardar alcance'}</button>
      </div>
    </Modal>
  )
}

const ROLE_HINT: Record<Role, string> = {
  coach: 'Coach (solo los equipos que le asigne)',
  director: 'Director técnico (deportes y/o equipos que le asigne)',
  org_admin: 'Administrador (toda la organización)',
}

function InviteMemberDialog({ roles, onClose }: { roles: Role[]; onClose: () => void }) {
  const { branding, can } = useOrg()
  const teams = useTeams() // ya viene limitado al alcance del usuario
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<Role>(roles.includes('coach') ? 'coach' : roles[0])
  const [teamIds, setTeamIds] = useState<number[]>([])
  const [sportIds, setSportIds] = useState<number[]>([])

  const invite = usePcMutation<void, { invite_url: string }>({
    method: 'POST', path: 'invitations', idempotent: true,
    body: () => ({
      email: email.trim(), role,
      ...(role === 'coach' ? { team_ids: teamIds } : {}),
      ...(role === 'director' ? { sport_ids: sportIds, team_ids: teamIds } : {}),
    }),
    invalidate: [['invitations']],
  })
  const submit = (e: FormEvent) => { e.preventDefault(); if (!invite.isPending) invite.mutate() }
  const directorMissingScope = role === 'director' && !sportIds.length && !teamIds.length

  return (
    <Modal title={can.manage_directors ? 'Invitar miembro' : 'Invitar coach'} onClose={onClose}>
      {invite.data ? (
        <>
          <InviteLink url={invite.data.invite_url} orgName={branding.name} roleLabel={ROLE_LABEL[role].toLowerCase()} />
          <button className="btn-primary mt-4 w-full" onClick={onClose}>Listo</button>
        </>
      ) : (
        <form onSubmit={submit} className="space-y-3" noValidate>
          {invite.error instanceof ApiError && !Object.keys(invite.error.fields).length && <ErrorAlert error={invite.error} />}
          <TextField label="Correo" type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} required error={fieldError(invite.error, 'email')} autoFocus />
          {roles.length > 1 ? (
            <SelectField label="Rol" value={role} onChange={(e) => { setRole(e.target.value as Role); setTeamIds([]); setSportIds([]) }}>
              {roles.map((r) => <option key={r} value={r}>{ROLE_HINT[r]}</option>)}
            </SelectField>
          ) : <p className="text-sm"><span className="font-semibold">Rol:</span> {ROLE_HINT[role]}</p>}

          {role === 'coach' && (
            <fieldset>
              <legend className="label">Equipos que trabajará</legend>
              {teams.data?.length ? (
                <div className="max-h-48 space-y-1 overflow-y-auto rounded-xl border border-black/10 p-2">
                  {teams.data.map((t) => (
                    <label key={t.id} className="flex min-h-10 items-center gap-2">
                      <input type="checkbox" className="size-5 accent-[var(--org-accent)]" checked={teamIds.includes(t.id)}
                        onChange={(e) => setTeamIds((ids) => (e.target.checked ? [...ids, t.id] : ids.filter((x) => x !== t.id)))} />
                      {t.name} <span className="text-xs text-black/50">· {t.sport.name}</span>
                    </label>
                  ))}
                </div>
              ) : <p className="text-sm text-black/60">Aún no hay equipos. Puede asignarlos después.</p>}
              {fieldError(invite.error, 'team_ids') && <p className="mt-1 text-sm text-red-700">{fieldError(invite.error, 'team_ids')}</p>}
            </fieldset>
          )}

          {role === 'director' && (
            <ScopePicker sportIds={sportIds} teamIds={teamIds} onSports={setSportIds} onTeams={setTeamIds}
              error={fieldError(invite.error, 'sport_ids') ?? fieldError(invite.error, 'team_ids') ?? (directorMissingScope ? 'Asigne al menos un deporte o un equipo.' : undefined)} />
          )}

          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancelar</button>
            <button className="btn-primary" disabled={invite.isPending || !email.includes('@') || directorMissingScope}>{invite.isPending ? 'Enviando…' : 'Crear invitación'}</button>
          </div>
        </form>
      )}
    </Modal>
  )
}
