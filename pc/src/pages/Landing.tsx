import { useEffect, type ReactNode } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { ArrowRight, ChevronRight } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { applyTheme, themeFor, useBranding } from '../lib/branding'
import { getLastOrg } from '../lib/session'
import { initials } from '../lib/color'
import { Spinner } from '../components/ui'
import { OrgLogo } from '../components/OrgLogo'
import { ProPlayerLogo } from '../components/Brand'
import type { Branding, Membership } from '../lib/types'

const HOST = 'pc.ppdguate.com'

/** Inicio sin sesión (pc.ppdguate.com): el último colegio usado; si no hay, se pide el enlace. */
export function Landing() {
  const { session, loading } = useAuth()

  useEffect(() => applyTheme(null), [])

  if (loading) return <Spinner />

  if (session) {
    const orgs = uniqueOrgs(session.memberships)
    if (orgs.length === 1) return <Navigate to={`/${orgs[0].organization.slug}`} replace />
    if (orgs.length > 1) {
      return (
        <PpdShell>
          <h1 className="title text-[40px] sm:text-[52px]">Elija su organización</h1>
          <ul className="space-y-2">
            {orgs.map((m) => (
              <li key={m.organization_id}>
                <Link to={`/${m.organization.slug}`} className="flex min-h-[60px] items-center gap-3 rounded-[12px] bg-paper p-2.5 pr-4 hover:bg-black/5">
                  <OrgLogo org={m.organization} size={42} />
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{m.organization.name}</span>
                    <span className="text-sm text-muted">{m.role_label}</span>
                  </span>
                  <ChevronRight aria-hidden className="text-muted" />
                </Link>
              </li>
            ))}
          </ul>
        </PpdShell>
      )
    }
  }

  return (
    <PpdShell>
      <div className="space-y-2">
        <h1 className="title text-[40px] sm:text-[52px]">Plataforma Coach</h1>
        <p className="text-muted">Ingrese a través del enlace de su institución.</p>
      </div>
      <LastOrg />
    </PpdShell>
  )
}

/** "Último colegio usado": botón grande con el color de esa institución. */
function LastOrg() {
  const slug = getLastOrg()
  const branding = useBranding(slug ?? undefined)
  if (!slug || branding.isError) {
    return <p className="rounded-[12px] bg-paper p-4 text-[15px]">Si no tiene el enlace de su institución, pídalo a su coordinador o al administrador de su colegio.</p>
  }
  const org = branding.data
  const t = themeFor(org)
  const name = org?.name ?? slug
  return (
    <div className="space-y-2">
      <p className="caps text-[13px] tracking-[0.08em]">Último colegio usado</p>
      <Link
        to={`/${slug}/login`}
        className="flex min-h-[60px] items-center gap-3 rounded-[12px] py-2 pr-4 pl-2.5 hover:brightness-110"
        style={{ background: t.primary, color: t.onPrimary }}
      >
        <OrgBadge org={org} name={name} size={42} inverted />
        <span className="min-w-0 flex-1">
          <span className="block font-bold">Continuar a {name}</span>
          <span className="block truncate text-[13px]">{HOST}/{slug}</span>
        </span>
        <ArrowRight aria-hidden className="size-5 shrink-0" />
      </Link>
    </div>
  )
}

/** Logo o iniciales con los colores de una institución (no la del tema activo). */
function OrgBadge({ org, name, size, inverted = false }: { org?: Pick<Branding, 'logo_url' | 'crest_url' | 'colors'>; name: string; size: number; inverted?: boolean }) {
  const src = org?.logo_url ?? org?.crest_url
  if (src) return <img src={src} alt="" className="shrink-0 rounded-full bg-white object-contain" style={{ width: size, height: size }} />
  const t = themeFor(org)
  return (
    <span
      aria-hidden
      className="grid shrink-0 place-items-center rounded-full font-display font-extrabold italic"
      style={{ width: size, height: size, fontSize: size * 0.41, background: inverted ? '#F3F2F2' : t.primary, color: inverted ? t.accent : t.onPrimary }}
    >
      {initials(name)}
    </span>
  )
}

function uniqueOrgs(ms: Membership[]): Membership[] {
  const seen = new Map<string, Membership>()
  ms.forEach((m) => { if (!seen.has(m.organization.slug)) seen.set(m.organization.slug, m) })
  return [...seen.values()]
}

/** Página ppd: logo ProPlayer (a la izquierda en escritorio) y la tarjeta. */
function PpdShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-paper">
      <div className="mx-auto grid min-h-dvh max-w-[1280px] content-start items-center gap-7 px-4 pt-9 pb-6 lg:grid-cols-[minmax(0,1fr)_560px] lg:content-center lg:gap-16 lg:px-24 lg:py-12">
        <div className="space-y-7">
          <span className="lg:hidden"><ProPlayerLogo size={55} /></span>
          <span className="hidden lg:inline-flex"><ProPlayerLogo size={108} /></span>
          <p className="hidden max-w-[40ch] text-lg leading-relaxed text-muted lg:block">
            Asistencia, convocatorias, posiciones, minutos y estadísticas de sus equipos, publicados al instante en la App de las familias.
          </p>
        </div>
        <div className="space-y-5">
          <main className="card flex flex-col gap-6 rounded-[20px] px-5 py-6 shadow-[0_6px_24px_rgba(32,30,29,0.08)] lg:p-10">{children}</main>
          <p className="text-center text-[13px] text-muted">© {new Date().getFullYear()} ProPlayer Data</p>
        </div>
      </div>
    </div>
  )
}
