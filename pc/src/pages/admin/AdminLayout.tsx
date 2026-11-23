import type { ReactNode } from 'react'
import { Navigate, NavLink, Outlet } from 'react-router-dom'
import { canCreateTeams } from '../../lib/auth'
import { useOrg } from '../../lib/org'
import { useTeams } from '../../lib/queries'
import type { OrgPermissions } from '../../lib/types'
import { PageHeader } from '../../components/ui'

type Tab = { to: string; label: string; show: (p: OrgPermissions, managesSomeTeam: boolean) => boolean }

// Cada pestaña según los permisos que manda la API (no según el rol).
const TABS: Tab[] = [
  { to: 'miembros', label: 'Miembros', show: (p) => p.manage_members },
  { to: 'equipos', label: 'Equipos', show: (p, some) => canCreateTeams(p) || some },
  { to: 'temporadas', label: 'Temporadas', show: (p) => p.manage_seasons },
  { to: 'planes', label: 'Planes', show: (p) => p.manage_plans },
  { to: 'marca', label: 'Marca', show: (p) => p.manage_branding },
  { to: 'invitaciones', label: 'Invitaciones', show: (p) => p.manage_members },
]

function useVisibleTabs() {
  const { can } = useOrg()
  const teams = useTeams()
  const some = (teams.data ?? []).some((t) => t.can_manage)
  return TABS.filter((t) => t.show(can, some))
}

export function AdminLayout() {
  const { slug } = useOrg()
  const tabs = useVisibleTabs()
  return (
    <>
      <PageHeader title="Administración" />
      <nav aria-label="Administración" className="-mx-4 mb-5 flex gap-1 overflow-x-auto px-4 pb-1">
        {tabs.map(({ to, label }) => (
          <NavLink key={to} to={`/${slug}/admin/${to}`}
            className={({ isActive }) => `min-h-11 shrink-0 rounded-xl px-4 py-2.5 font-semibold ${isActive ? 'bg-org text-on-org' : 'bg-white ring-1 ring-black/10'}`}>
            {label}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </>
  )
}

/** /admin → primera pestaña que el usuario puede ver. */
export function AdminIndex() {
  const tabs = useVisibleTabs()
  return tabs[0] ? <Navigate to={tabs[0].to} replace /> : null
}

/** Protege cada pestaña por permiso; si no lo tiene, vuelve a /admin. */
export function RequirePermission({ allowed, children }: { allowed: boolean; children: ReactNode }) {
  const { slug } = useOrg()
  return allowed ? <>{children}</> : <Navigate to={`/${slug}/admin`} replace />
}
