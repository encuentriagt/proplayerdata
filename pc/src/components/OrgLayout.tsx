import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, Navigate, NavLink, Outlet, useLocation, useNavigate, useParams } from 'react-router-dom'
import { CalendarDays, Dumbbell, Home, LogOut, Menu, Settings, Shirt, Trophy, Users, X } from 'lucide-react'
import { hasAdminArea, permissionsFor, topRole, useAuth } from '../lib/auth'
import { applyTheme, useBranding } from '../lib/branding'
import { OrgContext, useOrg, type OrgContextValue } from '../lib/org'
import { setLastOrg } from '../lib/session'
import { Alert, Spinner } from './ui'
import { OrgLogo, PoweredBy } from './OrgLogo'
import { BackLink } from './BackLink'
import { SportProvider } from '../lib/sport'
import { useOrgSports, useTeams } from '../lib/queries'
import { ApiError } from '../lib/api'
import { OrgMissing } from '../pages/OrgAuthShell'

const NAV = [
  { to: '', label: 'Inicio', Icon: Home, end: true },
  { to: 'calendario', label: 'Calendario', Icon: CalendarDays },
  { to: 'partidos', label: 'Partidos', Icon: Trophy },
  { to: 'entrenos', label: 'Entrenos', Icon: Dumbbell },
  { to: 'equipos', label: 'Equipos', Icon: Shirt },
  { to: 'jugadores', label: 'Jugadores', Icon: Users },
]

export function OrgLayout() {
  const { slug = '' } = useParams()
  const { session, loading, logout, membershipsFor } = useAuth()
  const branding = useBranding(slug)
  const location = useLocation()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)

  const memberships = membershipsFor(slug)
  const can = useMemo(() => permissionsFor(memberships), [memberships])
  const role = topRole(memberships)

  useEffect(() => applyTheme(branding.data), [branding.data])
  useEffect(() => setOpen(false), [location.pathname])
  useEffect(() => { if (memberships.length) setLastOrg(slug) }, [memberships.length, slug])

  if (loading || branding.isLoading) return <Spinner />
  if (!session) return <Navigate to={`/${slug}/login`} replace state={{ from: location.pathname }} />
  if (session.user.must_change_password) return <Navigate to={`/${slug}/cambiar-contrasena`} replace />
  if (branding.error instanceof ApiError && branding.error.status === 404) return <Navigate to="/" replace />
  if (branding.isError || !branding.data) return <OrgMissing error={branding.error} />
  if (!branding.data.active) {
    return (
      <Centered>
        <Alert tone="error">Su organización no está activa. Comuníquese con su institución.</Alert>
      </Centered>
    )
  }
  if (!memberships.length) {
    return (
      <Centered>
        <Alert tone="warning">Su cuenta no tiene acceso a {branding.data.name}.</Alert>
        <button className="btn-secondary mt-4 w-full" onClick={() => navigate('/')}>Elegir otra organización</button>
      </Centered>
    )
  }

  const ctx: OrgContextValue = { slug, branding: branding.data, role, can }
  const roleLabel = memberships.find((m) => m.role === role)?.role_label ?? ''
  const nav = hasAdminArea(can) ? [...NAV, { to: 'admin', label: 'Administración', Icon: Settings }] : NAV

  const onLogout = async () => {
    await logout()
    navigate(`/${slug}/login`, { replace: true })
  }

  return (
    <OrgContext.Provider value={ctx}>
      <a href="#contenido" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded-lg focus:bg-white focus:p-2">
        Saltar al contenido
      </a>
      <div className="min-h-dvh lg:grid lg:grid-cols-[16rem_1fr]">
        <header className="sticky top-0 z-30 flex items-center gap-3 bg-org px-4 py-3 text-on-org shadow lg:hidden">
          <Link to={`/${slug}`} className="flex min-w-0 flex-1 items-center gap-3" aria-label={`${branding.data.name}, ir al inicio`}>
            <OrgLogo org={branding.data} size={36} onPrimary />
            <span className="truncate font-semibold">{branding.data.name}</span>
          </Link>
          <button className="rounded-lg p-2 hover:bg-black/10" aria-label={open ? 'Cerrar menú' : 'Abrir menú'} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
            {open ? <X aria-hidden /> : <Menu aria-hidden />}
          </button>
        </header>

        <aside className={`${open ? 'block' : 'hidden'} fixed inset-x-0 top-[60px] bottom-0 z-20 overflow-y-auto bg-white lg:static lg:block lg:min-h-dvh lg:border-r lg:border-black/10`}>
          <Link to={`/${slug}`} className="hidden items-center gap-3 bg-org p-4 text-on-org lg:flex" aria-label={`${branding.data.name}, ir al inicio`}>
            <OrgLogo org={branding.data} size={44} onPrimary />
            <span className="font-semibold leading-tight">{branding.data.name}</span>
          </Link>
          <nav aria-label="Principal" className="flex flex-col gap-1 p-3">
            {nav.map(({ to, label, Icon, end }) => (
              <NavLink
                key={to}
                to={to ? `/${slug}/${to}` : `/${slug}`}
                end={end}
                className={({ isActive }) =>
                  `flex min-h-11 items-center gap-3 rounded-xl px-3 font-semibold ${isActive ? 'bg-org text-on-org' : 'hover:bg-black/5'}`
                }
              >
                <Icon className="size-5" aria-hidden />
                {label}
              </NavLink>
            ))}
          </nav>
          <div className="mt-4 border-t border-black/10 p-4 text-sm">
            <p className="font-semibold">{session.user.name}</p>
            <p className="text-black/60">{roleLabel}</p>
            {session.memberships.length > 1 && new Set(session.memberships.map((m) => m.organization.slug)).size > 1 && (
              <NavLink to="/" className="mt-2 block text-org-accent underline">Cambiar de organización</NavLink>
            )}
            <button className="btn-ghost -ml-3 mt-2" onClick={onLogout}>
              <LogOut className="size-4" aria-hidden /> Cerrar sesión
            </button>
          </div>
        </aside>

        <div className="flex min-h-dvh flex-col">
          <main id="contenido" className="mx-auto w-full max-w-6xl flex-1 px-4 py-5 sm:px-6 sm:py-8">
            <BackLink />
            <WithSport slug={slug}><Outlet /></WithSport>
          </main>
          <footer className="px-4 py-4 text-center"><PoweredBy /></footer>
        </div>
      </div>
    </OrgContext.Provider>
  )
}

function WithSport({ slug, children }: { slug: string; children: ReactNode }) {
  const sports = useOrgSports()
  const teams = useTeams()
  return (
    <SportProvider slug={slug} sports={sports.data ?? []} teams={teams.data ?? []} loading={sports.isLoading}>
      {children}
    </SportProvider>
  )
}

export function RequireAdminArea({ children }: { children: ReactNode }) {
  const { can, slug } = useOrg()
  return hasAdminArea(can) ? <>{children}</> : <Navigate to={`/${slug}`} replace />
}

export function Centered({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-dvh place-items-center p-4">
      <div className="w-full max-w-sm">{children}</div>
    </div>
  )
}
