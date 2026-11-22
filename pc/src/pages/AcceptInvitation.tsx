import { useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ApiError, newIdempotencyKey, request, requestIdempotent } from '../lib/api'
import { useAuth } from '../lib/auth'
import { Alert, ErrorAlert, Spinner, TextField, fieldError } from '../components/ui'
import type { PublicInvitation } from '../lib/types'
import { OrgAuthShell, OrgMissing } from './OrgAuthShell'

export function AcceptInvitation() {
  const { slug = '' } = useParams()
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const navigate = useNavigate()
  const { login } = useAuth()

  const inv = useQuery({
    queryKey: ['invitation', token],
    queryFn: async () => (await request<PublicInvitation>(`public/invitations/${encodeURIComponent(token)}`, { anonymous: true })).data,
    enabled: !!token,
    retry: false,
  })

  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const keyRef = useRef<string | null>(null)

  if (!token) return <OrgMissing />
  if (inv.isLoading) return <Spinner />
  if (inv.isError || !inv.data) {
    return (
      <div className="grid min-h-dvh place-items-center p-4">
        <div className="card w-full max-w-sm space-y-4 p-6">
          <ErrorAlert error={inv.error} />
          <Link to="/" className="btn-secondary w-full">Volver</Link>
        </div>
      </div>
    )
  }

  const data = inv.data
  const org = data.organization

  if (data.role === 'guardian') {
    return (
      <OrgAuthShell org={org}>
        <Alert tone="info">Esta invitación es para la App de padres de ppd. Ábrala desde su celular con la App instalada.</Alert>
      </OrgAuthShell>
    )
  }

  if (data.status !== 'pending') {
    return (
      <OrgAuthShell org={org}>
        <Alert tone="warning">
          {data.status === 'accepted' ? 'Esta invitación ya fue aceptada.' : 'Esta invitación venció. Pida una nueva a su administrador.'}
        </Alert>
        <Link to={`/${org.slug}/login`} className="btn-primary mt-4 w-full">Ir a ingresar</Link>
      </OrgAuthShell>
    )
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!data.user_exists && password !== confirm) {
      setError(new ApiError(422, 'validation_failed', 'Revise los datos.', { password_confirmation: ['Las contraseñas no coinciden.'] }))
      return
    }
    setBusy(true)
    setError(null)
    keyRef.current ??= newIdempotencyKey()
    try {
      const body = data.user_exists ? { password } : { name: name.trim(), password, password_confirmation: confirm }
      const res = await requestIdempotent<{ ok: boolean; email: string }>(`public/invitations/${encodeURIComponent(token)}/accept`, {
        method: 'POST', body, anonymous: true, idempotencyKey: keyRef.current,
      })
      keyRef.current = null
      await login(res.data.email, password, false)
      navigate(`/${org.slug || slug}`, { replace: true })
    } catch (err) {
      if (err instanceof ApiError && err.status < 500) keyRef.current = null
      setError(err)
    } finally {
      setBusy(false)
    }
  }

  const general = error instanceof ApiError && (error.code !== 'validation_failed' || !Object.keys(error.fields).length) ? error : null

  return (
    <OrgAuthShell org={org}>
      <h1 className="title mb-1 text-2xl">Acepte su invitación</h1>
      <p className="mb-4 text-sm text-black/70">
        Lo invitaron como <strong>{data.role_label}</strong> con el correo {data.email_masked}.
      </p>
      <form onSubmit={submit} className="space-y-4" noValidate>
        {general && <ErrorAlert error={general} />}
        {data.user_exists ? (
          <>
            <p className="text-sm">Ya tiene una cuenta en ppd. Ingrese su contraseña para unirse.</p>
            <TextField label="Contraseña de su cuenta" type="password" autoComplete="current-password" value={password}
              onChange={(e) => setPassword(e.target.value)} error={fieldError(error, 'password')} required />
          </>
        ) : (
          <>
            <TextField label="Nombre completo" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)}
              error={fieldError(error, 'name')} required minLength={3} />
            <TextField label="Contraseña" type="password" autoComplete="new-password" value={password}
              onChange={(e) => setPassword(e.target.value)} error={fieldError(error, 'password')}
              hint="Mínimo 10 caracteres, con letras y números." required />
            <TextField label="Confirme la contraseña" type="password" autoComplete="new-password" value={confirm}
              onChange={(e) => setConfirm(e.target.value)} error={fieldError(error, 'password_confirmation')} required />
          </>
        )}
        <button className="btn-primary w-full" disabled={busy || !password || (!data.user_exists && (!name || !confirm))}>
          {busy ? 'Enviando…' : 'Aceptar invitación'}
        </button>
      </form>
    </OrgAuthShell>
  )
}
