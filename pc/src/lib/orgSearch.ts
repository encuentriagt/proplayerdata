import { ApiError, request } from './api'
import { fetchBranding } from './branding'
import type { Branding } from './types'

export type OrgResult = Pick<Branding, 'name' | 'slug' | 'logo_url' | 'crest_url' | 'colors'>

/** Convierte "Colegio Demo" o un enlace pegado en un identificador (colegio-demo). */
export function toSlug(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/^.*ppdguate\.com\//, '')
    .split(/[/?#]/)[0]
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * Busca instituciones por nombre (`GET /public/orgs?search=`). Si la API todavía no tiene
 * ese buscador (404), intenta el texto como identificador del enlace con la marca pública.
 */
export async function searchOrgs(text: string, signal?: AbortSignal): Promise<OrgResult[]> {
  try {
    const res = await request<OrgResult[]>('public/orgs', { query: { search: text.trim() }, anonymous: true, signal })
    return Array.isArray(res.data) ? res.data : []
  } catch (e) {
    if (!(e instanceof ApiError && (e.status === 404 || e.status === 405))) throw e
  }
  const slug = toSlug(text)
  if (!slug) return []
  try {
    const b = await fetchBranding(slug)
    return b.active ? [b] : []
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return []
    throw e
  }
}
