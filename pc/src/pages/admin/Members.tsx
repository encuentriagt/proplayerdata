import { useState, type FormEvent } from 'react'
import { KeyRound, UserPlus } from 'lucide-react'
import { ApiError } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { fmt } from '../../lib/dates'
import { ROLE_LABEL } from '../../lib/labels'
import { useOrg } from '../../lib/org'
import { useMembers, usePcMutation, useTeams } from '../../lib/queries'
import type { Member, Role } from '../../lib/types'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { InviteLink, ResetLink } from '../../components/InviteLink'
import { Modal } from '../../components/Modal'
import { Avatar, Empty, ErrorAlert, SelectField, Spinner, TextField, fieldError } from '../../components/ui'

const STATUS = { active: ['Activo', 'bg-emerald-100 text-emerald-800'], invited: ['Invitado', 'bg-sky-100 text-sky-800'], disabled: ['Desactivado', 'bg-stone-200 text-stone-700'] } as const

export function AdminMembers() {
  const members = useMembers()
  const { session } = useAuth()
  const [inviting, setInviting] = useState(false)
  const [removing, setRemoving] = useState<Member | null>(null)
  const [resetFor, setResetFor] = useState<Member | null>(null)
  const { branding } = useOrg()
  const reset = usePcMutation<Member, { reset_url: string; expires_at: string }>({
    method: 'POST', path: (m) => `members/${m.id}/reset-password`, body: () => ({}),
  })

  const toggle = usePcMutation<Member>({
    method: 'PATCH', path: (m) => `members/${m.id}`, body: (m) => ({ status: m.status === 'disabled' ? 'active' : 'disabled' }),
    invalidate: [['members']],
  })
  const remove = usePcMutation<Member>({
    method: 'DELETE', path: (m) => `members/${m.id}`, invalidate: [['members'], ['teams']], onSuccess: () => setRemoving(null),
  })

  return (
    <>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="title text-2xl">Miembros</h2>
        <button className="btn-primary" onClick={() => setInviting(true)}><UserPlus className="size-5" aria-hidden /> Invitar miembro</button>
      </div>
      <ErrorAlert error={toggle.error} />
      {members.isLoading ? <Spinner /> : members.isError ? <ErrorAlert error={members.error} /> : !members.data?.length ? <Empty>Sin miembros.</Empty> : (
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
                  {m.last_login_at && <p className="mt-1 text-xs text-black/50">Último ingreso: {fmt(m.last_login_at, "d MMM yyyy, HH:mm")}</p>}
                </div>
                {!self && (
                  <div className="flex gap-1">
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
      {inviting && <InviteMemberDialog onClose={() => setInviting(false)} />}
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
        Perderá el rol de {removing?.role_label.toLowerCase()} y sus equipos asignados.
        <ErrorAlert error={remove.error} />
      </ConfirmDialog>
    </>
  )
}

function InviteMemberDialog({ onClose }: { onClose: () => void }) {
  const { branding } = useOrg()
  const teams = useTeams()
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<Role>('coach')
  const [teamIds, setTeamIds] = useState<number[]>([])

  const invite = usePcMutation<void, { invite_url: string }>({
    method: 'POST', path: 'invitations', idempotent: true,
    body: () => ({ email: email.trim(), role, ...(role === 'coach' ? { team_ids: teamIds } : {}) }),
    invalidate: [['invitations']],
  })
  const submit = (e: FormEvent) => { e.preventDefault(); if (!invite.isPending) invite.mutate() }

  return (
    <Modal title="Invitar miembro" onClose={onClose}>
      {invite.data ? (
        <>
          <InviteLink url={invite.data.invite_url} orgName={branding.name} roleLabel={ROLE_LABEL[role].toLowerCase()} />
          <button className="btn-primary mt-4 w-full" onClick={onClose}>Listo</button>
        </>
      ) : (
        <form onSubmit={submit} className="space-y-3" noValidate>
          {invite.error instanceof ApiError && !invite.error.fields.email && <ErrorAlert error={invite.error} />}
          <TextField label="Correo" type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} required error={fieldError(invite.error, 'email')} autoFocus />
          <SelectField label="Rol" value={role} onChange={(e) => setRole(e.target.value as Role)}>
            <option value="coach">Coach (solo sus equipos)</option>
            <option value="director">Director deportivo (todos los equipos)</option>
            <option value="org_admin">Administrador</option>
          </SelectField>
          {role === 'coach' && (
            <fieldset>
              <legend className="label">Equipos que trabajará</legend>
              {teams.data?.length ? (
                <div className="max-h-48 space-y-1 overflow-y-auto rounded-xl border border-black/10 p-2">
                  {teams.data.map((t) => (
                    <label key={t.id} className="flex min-h-10 items-center gap-2">
                      <input type="checkbox" className="size-5 accent-[var(--org-accent)]" checked={teamIds.includes(t.id)}
                        onChange={(e) => setTeamIds((ids) => (e.target.checked ? [...ids, t.id] : ids.filter((x) => x !== t.id)))} />
                      {t.name}
                    </label>
                  ))}
                </div>
              ) : <p className="text-sm text-black/60">Aún no hay equipos. Puede asignarlos después.</p>}
            </fieldset>
          )}
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancelar</button>
            <button className="btn-primary" disabled={invite.isPending || !email.includes('@')}>{invite.isPending ? 'Enviando…' : 'Crear invitación'}</button>
          </div>
        </form>
      )}
    </Modal>
  )
}
