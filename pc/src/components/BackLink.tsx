import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'

const SECTION: Record<string, string> = {
  calendario: 'Calendario', partidos: 'Partidos', entrenos: 'Entrenos', equipos: 'Equipos', jugadores: 'Jugadores', eventos: 'Calendario', admin: 'Administración',
}

/**
 * Enlace para regresar, arriba de cada pantalla (en Inicio no aparece).
 * - Secciones (Partidos, Equipos…): "← Inicio".
 * - Detalles (un partido, un equipo, un jugador, un formulario): "← Volver" a la pantalla anterior;
 *   si se entró directo por enlace, a la lista de esa sección.
 */
export function BackLink() {
  const { slug = '' } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const parts = location.pathname.split('/').filter(Boolean).slice(1) // sin el slug
  if (parts.length === 0) return null

  const cls = 'mb-3 inline-flex min-h-11 items-center gap-1.5 rounded-xl pr-3 font-semibold text-org-accent hover:underline'
  const isSection = parts.length === 1 || parts[0] === 'admin'
  if (isSection) {
    return <Link to={`/${slug}`} className={cls}><ArrowLeft className="size-5" aria-hidden /> Inicio</Link>
  }

  const fallback = parts[0] === 'eventos' ? `/${slug}/calendario` : `/${slug}/${parts[0]}`
  // location.key === 'default' significa que es la primera pantalla de la pestaña (no hay a dónde volver).
  const canGoBack = location.key !== 'default'
  return (
    <button type="button" className={cls} onClick={() => (canGoBack ? navigate(-1) : navigate(fallback))}>
      <ArrowLeft className="size-5" aria-hidden /> {canGoBack ? 'Volver' : SECTION[parts[0]] ?? 'Volver'}
    </button>
  )
}
