import { ApiError, onUnauthorized, request, requestIdempotent } from './api'
import { getToken, setToken } from './session'

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

describe('cliente de la API', () => {
  const fetchMock = vi.fn()
  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
    sessionStorage.clear()
    localStorage.clear()
  })

  it('manda Accept, Authorization y la clave de idempotencia', async () => {
    setToken('abc', false)
    fetchMock.mockResolvedValue(json(200, { data: { ok: true } }))
    await request('pc/orgs/x/events', { method: 'POST', body: { a: 1 }, idempotencyKey: 'k-123456' })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/pc/orgs/x/events')
    expect(init.headers).toMatchObject({ Accept: 'application/json', Authorization: 'Bearer abc', 'Idempotency-Key': 'k-123456', 'Content-Type': 'application/json' })
  })

  it('guarda el token en sessionStorage o, con "Mantener sesión", en localStorage', () => {
    setToken('t1', false)
    expect(sessionStorage.getItem('ppd.pc.token')).toBe('t1')
    setToken('t2', true)
    expect(sessionStorage.getItem('ppd.pc.token')).toBeNull()
    expect(localStorage.getItem('ppd.pc.token')).toBe('t2')
  })

  it('convierte errores con code, message y fields', async () => {
    fetchMock.mockResolvedValue(json(422, { error: { code: 'validation_failed', message: 'Revise los datos.', fields: { email: ['Correo inválido.'] } } }))
    const err = await request('auth/login', { method: 'POST' }).catch((e) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err.code).toBe('validation_failed')
    expect(err.fields.email[0]).toBe('Correo inválido.')
  })

  it('con 401 borra el token y avisa', async () => {
    setToken('viejo', true)
    const spy = vi.fn()
    const off = onUnauthorized(spy)
    fetchMock.mockResolvedValue(json(401, { error: { code: 'unauthenticated', message: 'Inicie sesión.' } }))
    await request('auth/me').catch(() => {})
    expect(getToken()).toBeNull()
    expect(spy).toHaveBeenCalled()
    off()
  })

  it('reintenta errores de red con la MISMA clave de idempotencia', async () => {
    vi.useFakeTimers()
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValueOnce(json(200, { data: { id: 1 } }))
    const p = requestIdempotent('x', { method: 'PUT', body: {}, idempotencyKey: 'misma-clave' })
    await vi.runAllTimersAsync()
    await expect(p).resolves.toEqual({ data: { id: 1 } })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls.map(([, init]) => init.headers['Idempotency-Key'])).toEqual(['misma-clave', 'misma-clave'])
    vi.useRealTimers()
  })

  it('no reintenta errores de validación', async () => {
    fetchMock.mockResolvedValue(json(422, { error: { code: 'validation_failed', message: 'x' } }))
    await expect(requestIdempotent('x', { method: 'PUT', idempotencyKey: 'k-12345678' })).rejects.toBeInstanceOf(ApiError)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
