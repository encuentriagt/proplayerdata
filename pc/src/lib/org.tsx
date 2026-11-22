import { createContext, useContext } from 'react'
import type { Permissions } from './auth'
import type { Branding } from './types'

export interface OrgContextValue extends Permissions {
  slug: string
  branding: Branding
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
