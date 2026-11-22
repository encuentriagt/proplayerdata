import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Navigate, NavLink, Outlet, useLocation, useNavigate, useParams } from 'react-router-dom'
import { CalendarDays, Home, LogOut, Menu, Settings, Shirt, Users, X } from 'lucide-react'
import { permissionsFor, useAuth } from '../lib/auth'
import { applyTheme, useBranding } from '../lib/branding'
import { OrgContext, useOrg, type OrgContextValue } from '../lib/org'
import { setLastOrg } from '../lib/session'
import { Alert, Spinner } from './ui'
import { OrgLogo, PoweredBy } from './OrgLogo'
import { ApiError } from '../lib/api'
import { OrgMissing } from '../pages/OrgAuthShell'

const NAV = [
  { to: '', label: 'Inicio', Icon: Home, end: true },
  { to: 'calendario', label: 'Calendario', Icon: CalendarDays },
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
  const perms = useMemo(() => permissionsFor(memberships), [memberships])

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

  const ctx: OrgContextValue = { slug, branding: branding.data, ...perms }
  const roleLabel = memberships.find((m) => m.role === perms.role)?.role_label ?? ''
  const nav = perms.isAdmin ? [...NAV, { to: 'admin', label: 'Administración', Icon: Settings }] : NAV

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
          <OrgLogo org={branding.data} size={36} onPrimary />
          <p className="flex-1 truncate font-semibold">{branding.data.name}</p>
          <button className="rounded-lg p-2 hover:bg-black/10" aria-label={open ? 'Cerrar menú' : 'Abrir menú'} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
            {open ? <X aria-hidden /> : <Menu aria-hidden />}
          </button>
        </header>

        <aside className={`${open ? 'block' : 'hidden'} fixed inset-x-0 top-[60px] bottom-0 z-20 overflow-y-auto bg-white lg:static lg:block lg:min-h-dvh lg:border-r lg:border-black/10`}>
          <div className="hidden items-center gap-3 bg-org p-4 text-on-org lg:flex">
            <OrgLogo org={branding.data} size={44} onPrimary />
            <p className="font-semibold leading-tight">{branding.data.name}</p>
          </div>
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
            <Outlet />
          </main>
          <footer className="px-4 py-4 text-center"><PoweredBy /></footer>
        </div>
      </div>
    </OrgContext.Provider>
  )
}

export function RequireAdmin({ children }: { children: ReactNode }) {
  const { isAdmin, slug } = useOrg()
  return isAdmin ? <>{children}</> : <Navigate to={`/${slug}`} replace />
}

export function Centered({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-dvh place-items-center p-4">
      <div className="w-full max-w-sm">{children}</div>
    </div>
  )
}
