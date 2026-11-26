import { useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom'
import { Eye, EyeOff } from 'lucide-react'
import { ApiError } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useBranding } from '../lib/branding'
import { setLastOrg } from '../lib/session'
import { Alert, Spinner, TextField, fieldError } from '../components/ui'
import { OrgAuthShell, OrgMissing } from './OrgAuthShell'

export function Login() {
  const { slug = '' } = useParams()
  const branding = useBranding(slug)
  const { session, login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(false)
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)

  if (branding.isLoading) return <Spinner />
  if (branding.isError || !branding.data) return <OrgMissing error={branding.error} />
  const org = branding.data

  if (!org.active) {
    return (
      <OrgAuthShell org={org}>
        <Alert tone="error">Su organización no está activa. Comuníquese con su institución.</Alert>
      </OrgAuthShell>
    )
  }

  if (session?.memberships.some((m) => m.organization.slug === slug)) {
    return <Navigate to={session.user.must_change_password ? `/${slug}/cambiar-contrasena` : from ?? `/${slug}`} replace />
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const res = await login(email.trim(), password, remember)
      if (!res.memberships.some((m) => m.organization.slug === slug)) {
        setError(new ApiError(403, 'not_member', `Su cuenta no tiene acceso a ${org.name}. Si pertenece a otra institución, use su enlace.`))
        return
      }
      setLastOrg(slug)
      navigate(res.user.must_change_password ? `/${slug}/cambiar-contrasena` : from ?? `/${slug}`, { replace: true })
    } catch (err) {
      setError(err)
    } finally {
      setBusy(false)
    }
  }

  const general = error instanceof ApiError && error.code !== 'validation_failed' ? error : null
  const locked = general?.code === 'account_locked' ? Number(general.extra.retry_after_minutes ?? 0) : 0

  return (
    <OrgAuthShell org={org}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        {general && (
          <Alert tone="error">
            {general.code === 'too_many_requests' ? 'Demasiados intentos. Espere un minuto e intente de nuevo.' : general.message}
            {locked > 0 && <span className="block">Intente de nuevo en {locked} min.</span>}
          </Alert>
        )}
        <TextField label="Correo electrónico" type="email" autoComplete="username" inputMode="email" required
          placeholder="nombre@colegio.edu.gt" value={email} onChange={(e) => setEmail(e.target.value)} error={fieldError(error, 'email')} />
        <div className="relative">
          <TextField label="Contraseña" type={show ? 'text' : 'password'} autoComplete="current-password" required
            placeholder="Ingrese su contraseña" value={password} onChange={(e) => setPassword(e.target.value)} error={fieldError(error, 'password')} />
          <button type="button" className="absolute right-2 top-7 rounded-lg p-2 text-black/60 hover:bg-black/5"
            aria-label={show ? 'Ocultar contraseña' : 'Mostrar contraseña'} onClick={() => setShow((s) => !s)}>
            {show ? <EyeOff className="size-5" aria-hidden /> : <Eye className="size-5" aria-hidden />}
          </button>
        </div>
        <div className="flex items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="size-5 accent-[var(--org-primary)]" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            Mantener sesión
          </label>
          <Link to={`/${slug}/olvide-contrasena`} className="text-sm font-semibold text-org-accent underline">¿Olvidó su contraseña?</Link>
        </div>
        <button className="btn-primary min-h-12 w-full" disabled={busy || !email || !password}>{busy ? 'Ingresando…' : 'Ingresar'}</button>
      </form>
    </OrgAuthShell>
  )
}
