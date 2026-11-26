import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, Navigate, NavLink, Outlet, useLocation, useNavigate, useParams } from 'react-router-dom'
import { CalendarDays, Dumbbell, Home, LogOut, Menu, Shield, Trophy, Users, X } from 'lucide-react'
import { useVisibleTabs } from '../pages/admin/AdminLayout'
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
  { to: 'partidos', label: 'Partidos', Icon: Trophy },
  { to: 'entrenos', label: 'Entrenos', Icon: Dumbbell },
  { to: 'calendario', label: 'Calendario', Icon: CalendarDays },
  { to: 'equipos', label: 'Equipos', Icon: Shield },
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
        {/* Celular: barra con el color del colegio, menú a la izquierda e iniciales del usuario a la derecha */}
        <header className="sticky top-0 z-30 flex items-center gap-3 bg-org px-4 py-3 text-on-org lg:hidden">
          <button className="-ml-1 rounded-[10px] p-2 hover:bg-black/10" aria-label={open ? 'Cerrar menú' : 'Abrir menú'} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
            {open ? <X aria-hidden /> : <Menu aria-hidden />}
          </button>
          <Link to={`/${slug}`} className="flex min-w-0 flex-1 items-center gap-3" aria-label={`${branding.data.name}, ir al inicio`}>
            <OrgLogo org={branding.data} size={34} onPrimary />
            <span className="truncate font-semibold">{branding.data.name}</span>
          </Link>
          <span className="grid size-9 shrink-0 place-items-center rounded-full text-sm font-bold ring-2 ring-current" aria-label={session.user.name} role="img">
            {userInitials(session.user.name)}
          </span>
        </header>

        {/* Menú lateral blanco (256 px en escritorio; en celular se abre con el botón) */}
        <aside className={`${open ? 'flex' : 'hidden'} fixed inset-x-0 top-[60px] bottom-0 z-20 flex-col overflow-y-auto bg-surface lg:sticky lg:top-0 lg:flex lg:h-dvh lg:border-r lg:border-line`}>
          <Link to={`/${slug}`} className="hidden items-center gap-3 px-5 pb-4 pt-6 lg:flex" aria-label={`${branding.data.name}, ir al inicio`}>
            <OrgLogo org={branding.data} size={40} />
            <span className="font-semibold leading-tight">{branding.data.name}</span>
          </Link>
          <nav aria-label="Principal" className="flex flex-col gap-1 px-3 py-2">
            {NAV.map(({ to, label, Icon, end }) => (
              <NavLink key={to} to={to ? `/${slug}/${to}` : `/${slug}`} end={end}
                className={({ isActive }) => `flex min-h-11 items-center gap-3 rounded-[10px] px-3 ${isActive ? 'bg-org-soft font-semibold text-org-accent' : 'text-ink hover:bg-black/5'}`}>
                <Icon className="size-5" aria-hidden />
                {label}
              </NavLink>
            ))}
          </nav>
          {hasAdminArea(can) && <AdminNav slug={slug} />}

          <div className="mt-auto border-t border-line p-4 text-sm">
            <p className="font-semibold">{session.user.name}</p>
            <p className="text-muted">{roleLabel}</p>
            {session.memberships.length > 1 && new Set(session.memberships.map((m) => m.organization.slug)).size > 1 && (
              <NavLink to="/" className="mt-2 block font-semibold text-org-accent underline">Cambiar de organización</NavLink>
            )}
            <button className="btn-ghost -ml-3 mt-1 min-h-10 text-ink" onClick={onLogout}>
              <LogOut className="size-4" aria-hidden /> Cerrar sesión
            </button>
            <PoweredBy className="mt-3" />
          </div>
        </aside>

        <div className="flex min-h-dvh min-w-0 flex-col">
          <main id="contenido" className="mx-auto w-full max-w-6xl flex-1 px-4 py-5 sm:px-8 sm:py-9">
            <BackLink />
            <WithSport slug={slug}><Outlet /></WithSport>
          </main>
          <footer className="px-4 py-5 text-center lg:hidden"><PoweredBy /></footer>
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

function userInitials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('')
}

/** "ADMINISTRACIÓN" en el menú lateral, con sus apartados según los permisos. */
function AdminNav({ slug }: { slug: string }) {
  const tabs = useVisibleTabs()
  return (
    <nav aria-label="Menú de administración" className="mt-3 flex flex-col gap-0.5 px-3 pb-2">
      <NavLink to={`/${slug}/admin`} end className="caps px-3 py-2 hover:text-ink">Administración</NavLink>
      {tabs.map((t) => (
        <NavLink key={t.to} to={`/${slug}/admin/${t.to}`}
          className={({ isActive }) => `flex min-h-10 items-center rounded-[10px] pl-11 pr-3 ${isActive ? 'bg-org-soft font-semibold text-org-accent' : 'text-ink hover:bg-black/5'}`}>
          {t.label}
        </NavLink>
      ))}
    </nav>
  )
}
