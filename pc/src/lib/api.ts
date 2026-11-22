import { clearToken, getToken } from './session'

// En producción, la API real; en desarrollo, /api pasa por el proxy de Vite. VITE_API_URL tiene prioridad.
export const API_URL =
  (import.meta.env.VITE_API_URL as string | undefined) || (import.meta.env.PROD ? 'https://api.ppdguate.com/api' : '/api')

export type FieldErrors = Record<string, string[]>

/** Error de la API: se decide por `code` (estable) y se muestra `message`. */
export class ApiError extends Error {
  readonly code: string
  readonly status: number
  readonly fields: FieldErrors
  readonly extra: Record<string, unknown>

  constructor(status: number, code: string, message: string, fields: FieldErrors = {}, extra: Record<string, unknown> = {}) {
    super(message)
    this.status = status
    this.code = code
    this.fields = fields
    this.extra = extra
  }
}

type Listener = () => void
const unauthorizedListeners = new Set<Listener>()
/** Se llama cuando la API responde 401: borrar sesión y llevar al login. */
export function onUnauthorized(fn: Listener): () => void {
  unauthorizedListeners.add(fn)
  return () => unauthorizedListeners.delete(fn)
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body?: unknown
  query?: Record<string, string | number | boolean | null | undefined>
  /** Clave de idempotencia: una por acción del usuario; la misma en cada reintento. */
  idempotencyKey?: string
  headers?: Record<string, string>
  signal?: AbortSignal
  /** No adjuntar el token (rutas públicas). */
  anonymous?: boolean
}

export interface ApiResponse<T, M = Record<string, unknown>> {
  data: T
  meta?: M
}

export function buildUrl(path: string, query?: RequestOptions['query']): string {
  const base = API_URL.replace(/\/$/, '')
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v !== undefined && v !== null && v !== '') qs.set(k, String(v))
  }
  const q = qs.toString()
  return `${base}/${path.replace(/^\//, '')}${q ? `?${q}` : ''}`
}

export async function request<T, M = Record<string, unknown>>(path: string, opts: RequestOptions = {}): Promise<ApiResponse<T, M>> {
  const headers: Record<string, string> = { Accept: 'application/json', ...opts.headers }
  const token = opts.anonymous ? null : getToken()
  if (token) headers.Authorization = `Bearer ${token}`
  if (opts.idempotencyKey) headers['Idempotency-Key'] = opts.idempotencyKey

  let body: BodyInit | undefined
  if (opts.body instanceof FormData) {
    body = opts.body
  } else if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json'
    body = JSON.stringify(opts.body)
  }

  let res: Response
  try {
    res = await fetch(buildUrl(path, opts.query), { method: opts.method ?? 'GET', headers, body, signal: opts.signal })
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e
    throw new ApiError(0, 'network_error', 'No hay conexión. Revise su señal e intente de nuevo.')
  }

  if (res.status === 204) return { data: undefined as T }

  let json: unknown = null
  try {
    json = await res.json()
  } catch {
    /* respuesta sin cuerpo */
  }

  if (!res.ok) {
    const err = (json as { error?: { code?: string; message?: string; fields?: FieldErrors } } | null)?.error
    const { code, message, fields, ...extra } = err ?? {}
    if (res.status === 401 && token) {
      clearToken()
      unauthorizedListeners.forEach((fn) => fn())
    }
    throw new ApiError(
      res.status,
      code ?? (res.status === 401 ? 'unauthenticated' : 'server_error'),
      message ?? 'Ocurrió un error. Intente de nuevo.',
      fields ?? {},
      extra,
    )
  }

  return json as ApiResponse<T, M>
}

/** Envía con reintentos de red usando SIEMPRE la misma Idempotency-Key. */
export async function requestIdempotent<T, M = Record<string, unknown>>(
  path: string,
  opts: RequestOptions & { idempotencyKey: string },
  retries = 2,
): Promise<ApiResponse<T, M>> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await request<T, M>(path, opts)
    } catch (e) {
      const retryable = e instanceof ApiError && (e.code === 'network_error' || e.status >= 500)
      if (!retryable || attempt >= retries) throw e
      await new Promise((r) => setTimeout(r, 600 * (attempt + 1)))
    }
  }
}

export function newIdempotencyKey(): string {
  return crypto.randomUUID()
}
