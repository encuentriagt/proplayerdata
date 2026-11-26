import { useEffect, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ApiError } from '../lib/api'
import { applyTheme } from '../lib/branding'
import type { Branding } from '../lib/types'
import { OrgLogo, PoweredBy } from '../components/OrgLogo'

/** Pantalla de login/invitación con la marca de la organización (portada de fondo si existe). */
/**
 * Login, invitación y contraseñas con la marca del colegio (diseño): franja superior con el color del colegio
 * (o su portada), logo en círculo blanco, nombre en titular y "Plataforma Coach"; debajo, el formulario.
 * En escritorio es una tarjeta centrada.
 */
export function OrgAuthShell({ org, children }: { org: Branding; children: ReactNode }) {
  useEffect(() => applyTheme(org), [org])
  return (
    <div className="min-h-dvh bg-paper sm:grid sm:place-items-center sm:p-6">
      <div className="flex min-h-dvh w-full flex-col overflow-hidden bg-paper sm:min-h-0 sm:max-w-md sm:rounded-[20px] sm:bg-surface sm:shadow-[0_12px_32px_rgba(45,43,43,0.18)]">
        <header className="relative bg-org px-7 pb-8 pt-10 text-on-org">
          {org.cover_url && (
            <>
              <img src={org.cover_url} alt="" className="absolute inset-0 size-full object-cover" />
              <div className="absolute inset-0 bg-org/80" aria-hidden />
            </>
          )}
          <div className="relative">
            <OrgLogo org={org} size={76} onPrimary />
            <p className="title mt-5 text-[40px] leading-[0.95]">{org.name}</p>
            <p className="mt-1.5 font-semibold opacity-90">Plataforma Coach</p>
          </div>
        </header>
        <div className="flex flex-1 flex-col px-7 py-7">
          <div className="flex-1">{children}</div>
          <div className="mt-8 text-center"><PoweredBy /></div>
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
