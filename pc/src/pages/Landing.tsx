import { useEffect, useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { ChevronRight, Search } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { applyTheme } from '../lib/branding'
import { getLastOrg } from '../lib/session'
import { Spinner } from '../components/ui'
import { OrgLogo } from '../components/OrgLogo'
import { ProPlayerLogo } from '../components/Brand'
import type { Membership } from '../lib/types'

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export function Landing() {
  const { session, loading } = useAuth()
  const navigate = useNavigate()
  const [slug, setSlug] = useState('')
  const [err, setErr] = useState<string>()

  useEffect(() => applyTheme(null), [])

  if (loading) return <Spinner />

  if (session) {
    const orgs = uniqueOrgs(session.memberships)
    if (orgs.length === 1) return <Navigate to={`/${orgs[0].organization.slug}`} replace />
    if (orgs.length > 1) {
      return (
        <PpdShell>
          <h1 className="title text-3xl">Elija su organización</h1>
          <ul className="mt-5 space-y-2">
            {orgs.map((m) => (
              <li key={m.organization_id}>
                <Link to={`/${m.organization.slug}`} className="card flex items-center gap-3 p-3 hover:ring-ppd-green">
                  <OrgLogo org={m.organization} size={44} />
                  <span className="flex-1">
                    <span className="block font-semibold">{m.organization.name}</span>
                    <span className="text-sm text-black/60">{m.role_label}</span>
                  </span>
                  <ChevronRight aria-hidden className="text-black/40" />
                </Link>
              </li>
            ))}
          </ul>
        </PpdShell>
      )
    }
  }

  const last = getLastOrg()

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const s = slug.trim().toLowerCase().replace(/^.*ppdguate\.com\//, '').split(/[/?#]/)[0]
    if (!SLUG.test(s)) return setErr('Escriba el identificador tal como aparece en el enlace de su institución.')
    navigate(`/${s}/login`)
  }

  return (
    <PpdShell>
      <h1 className="title text-[40px]">Plataforma Coach</h1>
      <p className="mt-2 text-muted">Ingrese a través del enlace de su institución.</p>
      {last && (
        <Link to={`/${last}/login`} className="btn-primary mt-6 w-full">Continuar a {last}</Link>
      )}
      <form onSubmit={submit} className="mt-6" noValidate>
        <label htmlFor="slug" className="label">¿No tiene el enlace? Busque su institución</label>
        <div className="flex gap-2">
          <input
            id="slug"
            className="input"
            placeholder="ej. colegio-demo"
            value={slug}
            autoCapitalize="none"
            autoCorrect="off"
            aria-invalid={!!err}
            aria-describedby={err ? 'slug-err' : undefined}
            onChange={(e) => { setSlug(e.target.value); setErr(undefined) }}
          />
          <button className="btn-primary shrink-0" aria-label="Buscar"><Search className="size-5" aria-hidden /></button>
        </div>
        {err && <p id="slug-err" className="mt-1 text-sm text-red-700">{err}</p>}
      </form>
    </PpdShell>
  )
}

function uniqueOrgs(ms: Membership[]): Membership[] {
  const seen = new Map<string, Membership>()
  ms.forEach((m) => { if (!seen.has(m.organization.slug)) seen.set(m.organization.slug, m) })
  return [...seen.values()]
}

function PpdShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh place-items-center bg-paper p-4">
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center"><ProPlayerLogo size={60} /></div>
        <div className="card p-6 sm:p-8">{children}</div>
      </div>
    </div>
  )
}
