import { Link } from 'react-router-dom'
import { useOrg } from '../lib/org'

export function NotFound() {
  const { slug } = useOrg()
  return (
    <div className="py-16 text-center">
      <h1 className="title text-4xl">Página no encontrada</h1>
      <Link to={`/${slug}`} className="btn-primary mt-6">Ir al inicio</Link>
    </div>
  )
}
