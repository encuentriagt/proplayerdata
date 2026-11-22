import { useRef, useState, type FormEvent } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { ApiError, newIdempotencyKey, requestIdempotent } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useBranding } from '../lib/branding'
import { ErrorAlert, Spinner, TextField, fieldError } from '../components/ui'
import type { Session, User } from '../lib/types'
import { OrgAuthShell, OrgMissing } from './OrgAuthShell'

export function ChangePassword() {
  const { slug = '' } = useParams()
  const branding = useBranding(slug)
  const { session, loading } = useAuth()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [current, setCurrent] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const keyRef = useRef<string | null>(null)

  if (loading || branding.isLoading) return <Spinner />
  if (!session) return <Navigate to={`/${slug}/login`} replace />
  if (!branding.data) return <OrgMissing />

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
      const res = await requestIdempotent<{ ok: boolean; user: User }>('auth/password', {
        method: 'POST',
        body: { current_password: current, password, password_confirmation: confirm },
        idempotencyKey: keyRef.current,
      })
      keyRef.current = null
      qc.setQueryData<Session>(['me'], (s) => (s ? { ...s, user: res.data.user } : s))
      navigate(`/${slug}`, { replace: true })
    } catch (err) {
      if (err instanceof ApiError && err.status < 500) keyRef.current = null
      setError(err)
    } finally {
      setBusy(false)
    }
  }

  const general = error instanceof ApiError && error.code !== 'validation_failed' ? error : null

  return (
    <OrgAuthShell org={branding.data}>
      <h1 className="title mb-1 text-2xl">Cambie su contraseña</h1>
      {session.user.must_change_password && (
        <p className="mb-4 text-sm text-black/70">Por seguridad, antes de continuar cree una contraseña nueva.</p>
      )}
      <form onSubmit={submit} className="space-y-4" noValidate>
        {general && <ErrorAlert error={general} />}
        <TextField label="Contraseña actual" type="password" autoComplete="current-password" value={current}
          onChange={(e) => setCurrent(e.target.value)} error={fieldError(error, 'current_password')} required />
        <TextField label="Contraseña nueva" type="password" autoComplete="new-password" value={password}
          onChange={(e) => setPassword(e.target.value)} error={fieldError(error, 'password')} hint="Mínimo 10 caracteres, con letras y números." required />
        <TextField label="Confirme la contraseña nueva" type="password" autoComplete="new-password" value={confirm}
          onChange={(e) => setConfirm(e.target.value)} error={fieldError(error, 'password_confirmation')} required />
        <button className="btn-primary w-full" disabled={busy || !current || !password || !confirm}>
          {busy ? 'Guardando…' : 'Guarde la contraseña'}
        </button>
      </form>
    </OrgAuthShell>
  )
}
