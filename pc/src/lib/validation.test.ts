import { humanizeValidation } from '../components/ui'

describe('mensajes de validación', () => {
  it('traduce las claves sin traducir de la API', () => {
    expect(humanizeValidation('validation.required')).toBe('Este campo es obligatorio.')
    expect(humanizeValidation('validation.max.string')).toBe('Es demasiado largo o grande.')
    expect(humanizeValidation('validation.algo_nuevo')).toBe('Revise este dato.')
  })
  it('deja igual los mensajes que ya vienen en español', () => {
    expect(humanizeValidation('La posición no corresponde al deporte.')).toBe('La posición no corresponde al deporte.')
  })
})
