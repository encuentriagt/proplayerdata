import { Link } from 'react-router-dom'
import { ChevronRight, Plus } from 'lucide-react'
import { TEAM_GENDER } from '../lib/labels'
import { canCreateTeams } from '../lib/auth'
import { useOrg } from '../lib/org'
import { useTeams } from '../lib/queries'
import { Empty, ErrorAlert, PageHeader, Spinner } from '../components/ui'

export function Teams() {
  const { slug, can } = useOrg()
  const canCreate = canCreateTeams(can)
  const teams = useTeams()

  return (
    <>
      <PageHeader title="Equipos" actions={canCreate && (
        <Link to={`/${slug}/admin/equipos`} className="btn-primary"><Plus className="size-5" aria-hidden /> Crear o administrar equipos</Link>
      )} />
      {teams.isLoading ? <Spinner /> : teams.isError ? <ErrorAlert error={teams.error} /> : !teams.data?.length ? (
        <Empty>{canCreate ? 'Aún no hay equipos. Créelos en Administración.' : 'Aún no tiene equipos asignados. Consulte con su institución.'}</Empty>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {teams.data.map((t) => (
            <li key={t.id}>
              <Link to={`/${slug}/equipos/${t.id}`} className="card flex items-center gap-3 p-4 hover:ring-2 hover:ring-org/40">
                <span aria-hidden className="h-12 w-2 shrink-0 rounded-full" style={{ background: t.color ?? 'var(--org-primary)' }} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{t.name}</span>
                  <span className="text-sm text-black/60">
                    {[t.sport.name, t.category, t.gender && TEAM_GENDER[t.gender], t.season?.name].filter(Boolean).join(' · ')}
                  </span>
                </span>
                <ChevronRight className="text-black/40" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
