import { useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { request } from '../lib/api'
import { useBranding } from '../lib/branding'
import { Alert, ErrorAlert, Spinner, TextField, fieldError } from '../components/ui'
import { OrgAuthShell, OrgMissing } from './OrgAuthShell'

export function ForgotPassword() {
  const { slug = '' } = useParams()
  const branding = useBranding(slug)
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [sent, setSent] = useState<string | null>(null)

  if (branding.isLoading) return <Spinner />
  if (branding.isError || !branding.data) return <OrgMissing error={branding.error} />

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const res = await request<{ ok: boolean; message: string }>('auth/password/forgot', {
        method: 'POST', body: { email: email.trim(), slug }, anonymous: true,
      })
      setSent(res.data.message)
    } catch (err) {
      setError(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <OrgAuthShell org={branding.data}>
      <h1 className="title mb-1 text-2xl">Recupere su contraseña</h1>
      {sent ? (
        <div className="space-y-4">
          {/* Mismo mensaje exista o no el correo: no revela quién tiene cuenta. */}
          <Alert tone="success">{sent}</Alert>
          <p className="text-sm text-black/70">El enlace vence en 60 minutos. Si no le llega, pida a su administrador un enlace para restablecerla.</p>
          <Link to={`/${slug}/login`} className="btn-primary w-full">Volver a ingresar</Link>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4" noValidate>
          <p className="text-sm text-black/70">Ingrese su correo y le enviaremos un enlace para crear una nueva contraseña.</p>
          {!fieldError(error, 'email') && <ErrorAlert error={error} />}
          <TextField label="Correo electrónico" type="email" inputMode="email" autoComplete="username" value={email}
            onChange={(e) => setEmail(e.target.value)} required error={fieldError(error, 'email')} autoFocus />
          <button className="btn-primary w-full" disabled={busy || !email.includes('@')}>{busy ? 'Enviando…' : 'Enviar enlace'}</button>
          <Link to={`/${slug}/login`} className="block text-center text-sm underline">Volver a ingresar</Link>
        </form>
      )}
    </OrgAuthShell>
  )
}
