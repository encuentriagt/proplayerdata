import { useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { ROLE_LABEL } from '../../lib/labels'
import { useOrg } from '../../lib/org'
import { fmt } from '../../lib/dates'
import { usePcMutation, useInvitations } from '../../lib/queries'
import type { Invitation } from '../../lib/types'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { InviteLink } from '../../components/InviteLink'
import { Modal } from '../../components/Modal'
import { Empty, ErrorAlert, Spinner } from '../../components/ui'

export function AdminInvitations() {
  const inv = useInvitations()
  const [revoking, setRevoking] = useState<Invitation | null>(null)
  const revoke = usePcMutation<Invitation>({ method: 'DELETE', path: (i) => `invitations/${i.id}`, invalidate: [['invitations']], onSuccess: () => setRevoking(null) })
  const { branding } = useOrg()
  const [resending, setResending] = useState<Invitation | null>(null)
  const resend = usePcMutation<Invitation, { invite_url: string }>({
    method: 'POST', path: (i) => `invitations/${i.id}/resend`, body: () => ({}), idempotent: true, invalidate: [['invitations']],
  })

  return (
    <>
      <h2 className="title mb-1 text-2xl">Invitaciones pendientes</h2>
      <p className="mb-3 text-sm text-black/60">Por seguridad, el enlace solo se muestra al crearlo. Si se perdió, use "Nuevo enlace": el anterior deja de servir.</p>
      {inv.isLoading ? <Spinner /> : inv.isError ? <ErrorAlert error={inv.error} /> : !inv.data?.length ? <Empty>No hay invitaciones pendientes.</Empty> : (
        <ul className="card divide-y divide-black/5">
          {inv.data.map((i) => (
            <li key={i.id} className="flex flex-wrap items-center gap-3 p-3">
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{i.email}</p>
                <p className="text-xs text-black/60">{i.role_label} · vence {fmt(i.expires_at, "d MMM, HH:mm")}</p>
              </div>
              <button className="btn-secondary min-h-9 text-sm" onClick={() => { resend.reset(); setResending(i) }}><RefreshCw className="size-4" aria-hidden /> Nuevo enlace</button>
              <button className="btn-ghost min-h-9 text-sm text-red-700" onClick={() => setRevoking(i)}>Anular</button>
            </li>
          ))}
        </ul>
      )}
      {resending && (
        <Modal title={`Nuevo enlace para ${resending.email}`} onClose={() => setResending(null)}>
          {resend.data ? (
            <>
              <InviteLink url={resend.data.invite_url} orgName={branding.name} roleLabel={(ROLE_LABEL[resending.role] ?? resending.role_label).toLowerCase()} />
              <button className="btn-primary mt-4 w-full" onClick={() => setResending(null)}>Listo</button>
            </>
          ) : (
            <div className="space-y-3">
              <p>Se generará un enlace nuevo y se renovará la vigencia. <strong>El enlace anterior dejará de funcionar.</strong></p>
              <ErrorAlert error={resend.error} />
              <div className="flex justify-end gap-2">
                <button className="btn-secondary" onClick={() => setResending(null)}>Cancelar</button>
                <button className="btn-primary" disabled={resend.isPending} onClick={() => resend.mutate(resending)}>{resend.isPending ? 'Generando…' : 'Generar enlace'}</button>
              </div>
            </div>
          )}
        </Modal>
      )}
      <ConfirmDialog open={!!revoking} title="¿Anular esta invitación?" confirmLabel="Anular" danger busy={revoke.isPending}
        onConfirm={() => revoking && revoke.mutate(revoking)} onCancel={() => setRevoking(null)}>
        El enlace enviado a {revoking?.email} dejará de funcionar.
        <ErrorAlert error={revoke.error} />
      </ConfirmDialog>
    </>
  )
}
