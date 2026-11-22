import { NavLink, Outlet } from 'react-router-dom'
import { useOrg } from '../../lib/org'
import { PageHeader } from '../../components/ui'

const TABS = [
  ['miembros', 'Miembros'],
  ['equipos', 'Equipos'],
  ['temporadas', 'Temporadas'],
  ['planes', 'Planes'],
  ['marca', 'Marca'],
  ['invitaciones', 'Invitaciones'],
] as const

export function AdminLayout() {
  const { slug } = useOrg()
  return (
    <>
      <PageHeader title="Administración" />
      <nav aria-label="Administración" className="-mx-4 mb-5 flex gap-1 overflow-x-auto px-4 pb-1">
        {TABS.map(([to, label]) => (
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
