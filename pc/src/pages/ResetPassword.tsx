import { useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ApiError, newIdempotencyKey, request, requestIdempotent } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useBranding } from '../lib/branding'
import { clearToken } from '../lib/session'
import { Alert, ErrorAlert, Spinner, TextField, fieldError } from '../components/ui'
import { OrgAuthShell, OrgMissing } from './OrgAuthShell'

export function ResetPassword() {
  const { slug = '' } = useParams()
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const branding = useBranding(slug)
  const { login } = useAuth()
  const navigate = useNavigate()

  const link = useQuery({
    queryKey: ['password-reset', token],
    queryFn: async () => (await request<{ email_masked: string }>(`auth/password/reset/${encodeURIComponent(token)}`, { anonymous: true })).data,
    enabled: !!token,
    retry: false,
  })

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const keyRef = useRef<string | null>(null)

  if (branding.isLoading || link.isLoading) return <Spinner />
  if (branding.isError || !branding.data) return <OrgMissing />
  const org = branding.data

  const invalid = !token || (link.error instanceof ApiError && link.error.code === 'reset_invalid')
  if (invalid || link.isError) {
    return (
      <OrgAuthShell org={org}>
        {invalid ? <Alert tone="warning">El enlace no es válido o ya venció. Pida uno nuevo.</Alert> : <ErrorAlert error={link.error} />}
        <Link to={`/${slug}/olvide-contrasena`} className="btn-primary mt-4 w-full">Pedir un enlace nuevo</Link>
      </OrgAuthShell>
    )
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (password !== confirm) {
      setError(new ApiError(422, 'validation_failed', '', { password_confirmation: ['Las contraseñas no coinciden.'] }))
      return
    }
    setBusy(true)
    setError(null)
    keyRef.current ??= newIdempotencyKey()
    try {
      const res = await requestIdempotent<{ ok: boolean; email: string }>('auth/password/reset', {
        method: 'POST', body: { token, password, password_confirmation: confirm }, anonymous: true, idempotencyKey: keyRef.current,
      })
      keyRef.current = null
      clearToken() // la API cerró todas las sesiones
      try {
        await login(res.data.email, password, false)
        navigate(`/${slug}`, { replace: true })
      } catch {
        navigate(`/${slug}/login`, { replace: true })
      }
    } catch (err) {
      if (err instanceof ApiError && err.status < 500) keyRef.current = null
      setError(err)
    } finally {
      setBusy(false)
    }
  }

  const general = error instanceof ApiError && error.code !== 'validation_failed' ? error : null

  return (
    <OrgAuthShell org={org}>
      <h1 className="title mb-1 text-2xl">Cree una nueva contraseña</h1>
      <p className="mb-4 text-sm text-black/70">Para la cuenta {link.data?.email_masked}.</p>
      <form onSubmit={submit} className="space-y-4" noValidate>
        {general && <ErrorAlert error={general} />}
        <TextField label="Contraseña nueva" type="password" autoComplete="new-password" value={password}
          onChange={(e) => setPassword(e.target.value)} error={fieldError(error, 'password')} hint="Mínimo 10 caracteres, con letras y números." required autoFocus />
        <TextField label="Confirme la contraseña" type="password" autoComplete="new-password" value={confirm}
          onChange={(e) => setConfirm(e.target.value)} error={fieldError(error, 'password_confirmation')} required />
        <button className="btn-primary w-full" disabled={busy || !password || !confirm}>{busy ? 'Guardando…' : 'Guarde la contraseña'}</button>
      </form>
    </OrgAuthShell>
  )
}
