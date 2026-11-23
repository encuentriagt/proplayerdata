import { createContext, useContext } from 'react'
import type { Branding, OrgPermissions, Role } from './types'

export interface OrgContextValue {
  slug: string
  branding: Branding
  /** Solo para mostrar la etiqueta del rol. Los permisos salen de `can`. */
  role: Role | null
  can: OrgPermissions
}

export const OrgContext = createContext<OrgContextValue | null>(null)

export function useOrg(): OrgContextValue {
  const ctx = useContext(OrgContext)
  if (!ctx) throw new Error('useOrg fuera de una ruta de organización')
  return ctx
}

/** Ruta de la API de la PC para la organización actual. */
export function pcPath(slug: string, path: string): string {
  return `pc/orgs/${encodeURIComponent(slug)}/${path.replace(/^\//, '')}`
}
