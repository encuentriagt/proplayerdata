import { contrast, initials, readableOn, accentOnLight } from './color'

describe('color', () => {
  it('calcula el contraste WCAG', () => {
    expect(contrast('#FFFFFF', '#000000')).toBeCloseTo(21, 0)
    expect(contrast('#777777', '#777777')).toBeCloseTo(1, 5)
  })

  it('usa on_primary si da contraste AA', () => {
    expect(readableOn('#0B1F4D', '#FFD700')).toBe('#FFD700')
  })

  it('el verde ppd con blanco no llega a AA (3.6:1): usa texto oscuro', () => {
    expect(contrast('#25984D', '#FFFFFF')).toBeLessThan(4.5)
    expect(readableOn('#25984D', '#FFFFFF')).toBe('#201E1D')
  })

  it('reemplaza on_primary si no da contraste', () => {
    // Amarillo con texto blanco no cumple: se usa la tinta oscura.
    expect(readableOn('#FFE14D', '#FFFFFF')).toBe('#201E1D')
    expect(readableOn('#0B1F4D', null)).toBe('#FFFFFF')
  })

  it('primario como texto: se oscurece hasta 4.5:1 sobre el papel', () => {
    const amarillo = accentOnLight('#FFE14D')
    expect(amarillo).not.toBe('#FFE14D')
    expect(contrast(amarillo, '#F3F2F2')).toBeGreaterThanOrEqual(4.5)
    expect(accentOnLight('#0B1F4D')).toBe('#0B1F4D')
  })

  it('saca iniciales del nombre de la organización', () => {
    expect(initials('Colegio Demo ppd')).toBe('CD')
    expect(initials('Liceo de la Salle')).toBe('LS')
  })
})
