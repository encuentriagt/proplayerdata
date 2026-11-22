import { useEffect, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
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

export function OrgMissing() {
  return (
    <div className="grid min-h-dvh place-items-center p-4">
      <div className="card w-full max-w-sm p-6 text-center">
        <p className="font-semibold">No se encontró la organización.</p>
        <p className="mt-1 text-sm text-black/60">Revise el enlace que le compartió su institución.</p>
        <Link to="/" className="btn-secondary mt-4 w-full">Volver</Link>
      </div>
    </div>
  )
}
