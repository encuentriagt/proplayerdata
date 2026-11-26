import { useQuery } from '@tanstack/react-query'
import { ApiError, buildUrl } from './api'
import { PPD, accentOnLight, isHex, readableOn } from './color'
import type { Branding } from './types'

// Caché local con ETag: si la marca no cambió, la API responde 304 y se usa la guardada.
const cacheKey = (slug: string) => `ppd.pc.branding.${slug}`

export async function fetchBranding(slug: string): Promise<Branding> {
  const cached = (() => {
    try {
      return JSON.parse(localStorage.getItem(cacheKey(slug)) ?? 'null') as { etag: string; data: Branding } | null
    } catch {
      return null
    }
  })()

  const headers: Record<string, string> = { Accept: 'application/json' }
  if (cached?.etag) headers['If-None-Match'] = cached.etag

  let res: Response
  try {
    res = await fetch(buildUrl(`public/orgs/${encodeURIComponent(slug)}/branding`), { headers })
  } catch {
    if (cached) return cached.data
    throw new ApiError(0, 'network_error', 'No hay conexión. Revise su señal e intente de nuevo.')
  }
  if (res.status === 304 && cached) return cached.data
  if (res.status === 404) throw new ApiError(404, 'not_found', 'No se encontró la organización.')
  if (!res.ok) {
    if (cached) return cached.data
    throw new ApiError(res.status, 'server_error', 'No se pudo cargar la organización.')
  }
  const json = (await res.json()) as { data: Branding }
  const etag = res.headers.get('ETag')
  if (etag) localStorage.setItem(cacheKey(slug), JSON.stringify({ etag, data: json.data }))
  return json.data
}

export function useBranding(slug: string | undefined) {
  return useQuery({
    queryKey: ['branding', slug],
    queryFn: () => fetchBranding(slug!),
    enabled: !!slug,
    staleTime: 5 * 60_000,
    retry: (n, e) => !(e instanceof ApiError && e.status === 404) && n < 2,
  })
}

export interface Theme {
  primary: string
  secondary: string
  onPrimary: string
  accent: string
}

export function themeFor(b?: Pick<Branding, 'colors'> | null): Theme {
  // Sin colegio (páginas ppd): tinta de la línea gráfica ProPlayer.
  const primary = isHex(b?.colors.primary) ? b!.colors.primary! : PPD.ink
  const secondary = isHex(b?.colors.secondary) ? b!.colors.secondary! : PPD.star
  return {
    primary,
    secondary,
    onPrimary: readableOn(primary, b?.colors.on_primary),
    accent: accentOnLight(primary),
  }
}

/** Pone en :root las variables CSS de la organización (o las de ppd si no hay). */
export function applyTheme(b?: Pick<Branding, 'colors'> | null): void {
  const t = themeFor(b)
  const root = document.documentElement.style
  root.setProperty('--org-primary', t.primary)
  root.setProperty('--org-secondary', t.secondary)
  root.setProperty('--org-on-primary', t.onPrimary)
  root.setProperty('--org-accent', t.accent)
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t.primary)
}
