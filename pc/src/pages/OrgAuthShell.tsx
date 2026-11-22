import { useEffect, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ApiError } from '../lib/api'
import { applyTheme } from '../lib/branding'
import type { Branding } from '../lib/types'
import { OrgLogo, PoweredBy } from '../components/OrgLogo'

/** Pantalla de login/invitación con la marca de la organización (portada de fondo si existe). */
export function OrgAuthShell({ org, children }: { org: Branding; children: ReactNode }) {
  useEffect(() => applyTheme(org), [org])
  return (
    <div className="relative grid min-h-dvh place-items-center bg-org p-4">
      {org.cover_url && (
        <>
          <img src={org.cover_url} alt="" className="absolute inset-0 size-full object-cover" />
          <div className="absolute inset-0 bg-black/45" aria-hidden />
        </>
      )}
      <div className="relative w-full max-w-sm">
        <div className="card p-6">
          <div className="mb-5 flex flex-col items-center text-center">
            <OrgLogo org={org} size={72} />
            <p className="mt-3 text-lg font-semibold">{org.name}</p>
            <p className="title text-xl text-org-accent">Plataforma Coach</p>
          </div>
          {children}
          <PoweredBy className="mt-6 text-center" />
        </div>
      </div>
    </div>
  )
}

/** Solo un 404 significa que la organización no existe; cualquier otro error es de conexión o del servidor. */
export function OrgMissing({ error }: { error?: unknown }) {
  const notFound = !error || (error instanceof ApiError && error.status === 404)
  return (
    <div className="grid min-h-dvh place-items-center p-4">
      <div className="card w-full max-w-sm p-6 text-center">
        <p className="font-semibold">{notFound ? 'No se encontró la organización.' : 'No se pudo conectar con el servidor.'}</p>
        <p className="mt-1 text-sm text-black/60">
          {notFound ? 'Revise el enlace que le compartió su institución.' : 'Revise su conexión e intente de nuevo en unos minutos.'}
        </p>
        {!notFound && <button className="btn-primary mt-4 w-full" onClick={() => window.location.reload()}>Intentar de nuevo</button>}
        <Link to="/" className="btn-secondary mt-4 w-full">Volver</Link>
      </div>
    </div>
  )
}
