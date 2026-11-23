import { useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Camera, Pencil, Trash2, UserPlus } from 'lucide-react'
import { ApiError } from '../lib/api'
import { fmt } from '../lib/dates'
import { MAX_PHOTO_BYTES, PHOTO_TYPES, cropSquare } from '../lib/image'
import { PLAYER_GENDER } from '../lib/labels'
import { useOrg } from '../lib/org'
import { usePcMutation, usePlayer } from '../lib/queries'
import type { PlayerDetail } from '../lib/types'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { InviteLink } from '../components/InviteLink'
import { Modal } from '../components/Modal'
import { Alert, Avatar, Empty, ErrorAlert, Spinner, TextField, fieldError } from '../components/ui'
import { PlayerFormDialog } from './PlayerForm'

export function PlayerDetailPage() {
  const { id } = useParams()
  const playerId = Number(id)
  const { slug, can } = useOrg()
  const navigate = useNavigate()
  const player = usePlayer(playerId)
  const [editing, setEditing] = useState(false)
  const [inviting, setInviting] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const remove = usePcMutation({
    method: 'DELETE', path: `players/${playerId}`, invalidate: [['players'], ['roster']],
    onSuccess: () => navigate(`/${slug}/jugadores`, { replace: true }),
  })

  if (player.isLoading) return <Spinner />
  if (player.isError || !player.data) return <ErrorAlert error={player.error} />
  const p = player.data

  return (
    <>
      <div className="card mb-6 flex flex-col items-center gap-4 p-5 sm:flex-row sm:items-start">
        <PhotoUploader player={p} />
        <div className="flex-1 text-center sm:text-left">
          <h1 className="title text-3xl sm:text-4xl">{p.full_name}</h1>
          <dl className="mt-2 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
            {p.birthdate && <Info k="Fecha de nacimiento" v={fmt(`${p.birthdate}T12:00:00-06:00`, "d 'de' MMMM yyyy")} />}
            {p.gender && <Info k="Género" v={PLAYER_GENDER[p.gender]} />}
            {p.document_number && <Info k="Documento" v={p.document_number} />}
          </dl>
          {p.notes && <p className="mt-2 whitespace-pre-line text-sm text-black/70">{p.notes}</p>}
          <div className="mt-3 flex flex-wrap justify-center gap-2 sm:justify-start">
            <button className="btn-secondary" onClick={() => setEditing(true)}><Pencil className="size-4" aria-hidden /> Editar datos</button>
            {can.delete_players && <button className="btn-ghost text-red-700" onClick={() => setDeleting(true)}><Trash2 className="size-4" aria-hidden /> Borrar</button>}
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section aria-labelledby="teams-h">
          <h2 id="teams-h" className="title mb-3 text-2xl">Equipos</h2>
          {p.teams.length ? (
            <ul className="card divide-y divide-black/5">
              {p.teams.map((t) => (
                <li key={t.id}>
                  <Link to={`/${slug}/equipos/${t.id}`} className="flex items-center gap-3 p-3 hover:bg-black/[0.02]">
                    <span className="w-10 text-center font-display text-2xl font-extrabold italic text-black/60">{t.jersey_number ?? '–'}</span>
                    <span className="flex-1">
                      <span className="block font-semibold">{t.name}</span>
                      <span className="text-xs text-black/60">{t.sport}{!t.active && ' · Inactivo'}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : <Empty>No está en ningún equipo que usted vea.</Empty>}
        </section>

        <section aria-labelledby="guardians-h">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 id="guardians-h" className="title text-2xl">Padres y encargados</h2>
            <button className="btn-primary" onClick={() => setInviting(true)}><UserPlus className="size-5" aria-hidden /> Invitar a padre o madre</button>
          </div>
          {p.guardians.length ? (
            <ul className="card divide-y divide-black/5">
              {p.guardians.map((g) => (
                <li key={g.user_id} className="flex items-center gap-3 p-3">
                  <Avatar name={g.name} size={36} />
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{g.name}</p>
                    <p className="truncate text-xs text-black/60">{[g.relationship, g.email].filter(Boolean).join(' · ') || 'Encargado'}</p>
                  </div>
                </li>
              ))}
            </ul>
          ) : <Empty>Aún no hay padres vinculados.</Empty>}
        </section>
      </div>

      {editing && <PlayerFormDialog player={p} onClose={() => setEditing(false)} />}
      {inviting && <InviteGuardianDialog player={p} onClose={() => setInviting(false)} />}
      <ConfirmDialog open={deleting} title={`¿Borrar a ${p.full_name}?`} confirmLabel="Borrar" danger busy={remove.isPending}
        onConfirm={() => remove.mutate()} onCancel={() => setDeleting(false)}>
        Se quitará de todos los equipos.
        <ErrorAlert error={remove.error} />
      </ConfirmDialog>
    </>
  )
}

function Info({ k, v }: { k: string; v: string }) {
  return <div><dt className="inline text-black/60">{k}: </dt><dd className="inline font-semibold">{v}</dd></div>
}

function PhotoUploader({ player }: { player: PlayerDetail }) {
  const input = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string>()
  const upload = usePcMutation<Blob, { photo_url: string }>({
    method: 'POST', path: `players/${player.id}/photo`,
    body: (blob) => { const fd = new FormData(); fd.append('photo', blob, 'foto.jpg'); return fd },
    invalidate: [['player', player.id], ['players'], ['roster']],
  })

  const onFile = async (file?: File) => {
    setError(undefined)
    if (!file) return
    if (!PHOTO_TYPES.includes(file.type)) return setError('Use una foto JPG, PNG o WEBP.')
    if (file.size > 15 * 1024 * 1024) return setError('La foto es demasiado grande.')
    try {
      const blob = await cropSquare(file)
      if (blob.size > MAX_PHOTO_BYTES) return setError('La foto supera 3 MB.')
      upload.mutate(blob)
    } catch {
      setError('No se pudo leer la foto.')
    }
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <Avatar name={player.full_name} url={player.photo_url} size={112} />
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" aria-label="Elegir foto"
        onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = '' }} />
      <button className="btn-ghost min-h-9 text-sm" disabled={upload.isPending} onClick={() => input.current?.click()}>
        <Camera className="size-4" aria-hidden /> {upload.isPending ? 'Subiendo…' : player.photo_url ? 'Cambiar foto' : 'Agregar foto'}
      </button>
      {(error || upload.error) && <p className="max-w-40 text-center text-sm text-red-700">{error ?? (upload.error as Error).message}</p>}
    </div>
  )
}

function InviteGuardianDialog({ player, onClose }: { player: PlayerDetail; onClose: () => void }) {
  const { branding } = useOrg()
  const [email, setEmail] = useState('')
  const invite = usePcMutation<void, { invite_url: string }>({
    method: 'POST', path: 'invitations', idempotent: true,
    body: () => ({ email: email.trim(), role: 'guardian', player_id: player.id }),
    invalidate: [['invitations']],
  })
  const submit = (e: FormEvent) => { e.preventDefault(); if (!invite.isPending) invite.mutate() }

  return (
    <Modal title={`Invitar a padre o madre de ${player.first_name}`} onClose={onClose}>
      {invite.data ? (
        <>
          <InviteLink url={invite.data.invite_url} orgName={branding.name} roleLabel={`encargado de ${player.first_name}`} />
          <p className="mt-3 text-sm text-black/60">El padre o madre debe abrir el enlace en su celular para usar la App de ppd.</p>
          <button className="btn-primary mt-4 w-full" onClick={onClose}>Listo</button>
        </>
      ) : (
        <form onSubmit={submit} className="space-y-3" noValidate>
          {invite.error instanceof ApiError && !invite.error.fields.email && <ErrorAlert error={invite.error} />}
          <Alert tone="info">Recibirá un enlace para crear su cuenta en la App de ppd y ver la información de {player.first_name}.</Alert>
          <TextField label="Correo del padre o madre" type="email" inputMode="email" autoComplete="off" value={email}
            onChange={(e) => setEmail(e.target.value)} required error={fieldError(invite.error, 'email')} autoFocus />
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancelar</button>
            <button className="btn-primary" disabled={invite.isPending || !email.includes('@')}>{invite.isPending ? 'Enviando…' : 'Crear invitación'}</button>
          </div>
        </form>
      )}
    </Modal>
  )
}
