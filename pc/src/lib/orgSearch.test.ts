import { describe, expect, it } from 'vitest'
import { toSlug } from './orgSearch'

describe('toSlug', () => {
  it('convierte nombres y enlaces en el identificador', () => {
    expect(toSlug('Colegio Demo')).toBe('colegio-demo')
    expect(toSlug('  Liceo Ñandú Álamo ')).toBe('liceo-nandu-alamo')
    expect(toSlug('https://pc.ppdguate.com/colegio-demo/login')).toBe('colegio-demo')
    expect(toSlug('¿?')).toBe('')
  })
})
