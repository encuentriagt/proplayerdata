import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ChevronRight, Search, UserPlus } from 'lucide-react'
import { useOrg } from '../lib/org'
import { usePlayers, useTeams } from '../lib/queries'
import { Avatar, Empty, ErrorAlert, PageHeader, Spinner } from '../components/ui'
import { PlayerFormDialog } from './PlayerForm'

export function Players() {
  const { slug } = useOrg()
  const [params, setParams] = useSearchParams()
  const [text, setText] = useState(params.get('q') ?? '')
  const [creating, setCreating] = useState(false)
  const teamId = Number(params.get('equipo')) || undefined
  const page = Number(params.get('pagina')) || 1
  const search = params.get('q') ?? ''

  // Espera un momento al escribir antes de buscar.
  useEffect(() => {
    const t = setTimeout(() => {
      if (text.trim() !== search) {
        const n = new URLSearchParams(params)
        text.trim() ? n.set('q', text.trim()) : n.delete('q')
        n.delete('pagina')
        setParams(n, { replace: true })
      }
    }, 300)
    return () => clearTimeout(t)
  }, [text, search, params, setParams])

  const teams = useTeams()
  const players = usePlayers({ team_id: teamId, search: search || undefined, page })
  const meta = players.data?.meta

  const setParam = (k: string, v?: string) => {
    const n = new URLSearchParams(params)
    v ? n.set(k, v) : n.delete(k)
    if (k !== 'pagina') n.delete('pagina')
    setParams(n, { replace: true })
  }

  return (
    <>
      <PageHeader title="Jugadores" subtitle={meta ? `${meta.total} jugador${meta.total === 1 ? '' : 'es'}` : undefined}
        actions={<button className="btn-primary" onClick={() => setCreating(true)}><UserPlus className="size-5" aria-hidden /> Nuevo jugador</button>} />

      <div className="mb-4 flex flex-wrap gap-2">
        <div className="relative min-w-60 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-black/40" aria-hidden />
          <input className="input pl-10" type="search" placeholder="Buscar por nombre o apellido" aria-label="Buscar jugador"
            value={text} onChange={(e) => setText(e.target.value)} />
        </div>
        <select className="input w-auto" aria-label="Filtrar por equipo" value={teamId ?? ''} onChange={(e) => setParam('equipo', e.target.value || undefined)}>
          <option value="">Todos los equipos</option>
          {teams.data?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </div>

      {players.isLoading ? <Spinner /> : players.isError ? <ErrorAlert error={players.error} /> : !players.data?.data.length ? (
        <Empty>{search ? 'No se encontraron jugadores con esa búsqueda.' : 'Aún no hay jugadores.'}</Empty>
      ) : (
        <>
          <ul className="card divide-y divide-black/5">
            {players.data.data.map((p) => (
              <li key={p.id}>
                <Link to={`/${slug}/jugadores/${p.id}`} className="flex items-center gap-3 p-3 hover:bg-black/[0.02]">
                  <Avatar name={p.full_name} url={p.photo_url} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{p.last_name}, {p.first_name}</span>
                    {p.birthdate && <span className="text-xs text-black/60">Nació en {p.birthdate.slice(0, 4)}</span>}
                  </span>
                  <ChevronRight className="text-black/40" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
          {meta && meta.last_page > 1 && (
            <nav aria-label="Páginas" className="mt-4 flex items-center justify-center gap-2">
              <button className="btn-secondary" disabled={page <= 1} onClick={() => setParam('pagina', String(page - 1))}>Anterior</button>
              <span className="text-sm">Página {page} de {meta.last_page}</span>
              <button className="btn-secondary" disabled={page >= meta.last_page} onClick={() => setParam('pagina', String(page + 1))}>Siguiente</button>
            </nav>
          )}
        </>
      )}
      {creating && <PlayerFormDialog onClose={() => setCreating(false)} />}
    </>
  )
}
