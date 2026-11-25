import { seriesDates, trainingNoticeText, untilDate, weekdaysText, MAX_SERIES } from './recurrence'

describe('entrenos recurrentes', () => {
  it('todos los miércoles de un mes', () => {
    // 2 dic 2026 es miércoles
    expect(seriesDates('2026-12-02', '2026-12-31', [3])).toEqual(['2026-12-02', '2026-12-09', '2026-12-16', '2026-12-23', '2026-12-30'])
  })
  it('lunes y miércoles, empezando en un día que no es de la serie', () => {
    expect(seriesDates('2026-12-01', '2026-12-09', [1, 3])).toEqual(['2026-12-02', '2026-12-07', '2026-12-09'])
  })
  it('6 meses de lunes y miércoles ≈ 52 entrenos', () => {
    const fin = untilDate('2026-12-02', '6m')!
    expect(fin).toBe('2027-06-02')
    const n = seriesDates('2026-12-02', fin, [1, 3]).length
    expect(n).toBeGreaterThanOrEqual(51)
    expect(n).toBeLessThanOrEqual(53)
  })
  it('otra fecha usa la fecha elegida', () => {
    expect(untilDate('2026-12-02', 'custom', '2027-03-15')).toBe('2027-03-15')
    expect(untilDate('2026-12-02', 'custom', '')).toBeNull()
  })
  it('sin días, sin fin o fin antes del inicio: nada', () => {
    expect(seriesDates('2026-12-02', '2026-12-31', [])).toEqual([])
    expect(seriesDates('2026-12-02', null, [3])).toEqual([])
    expect(seriesDates('2026-12-02', '2026-11-01', [3])).toEqual([])
  })
  it('se corta al pasar el máximo', () => {
    expect(seriesDates('2026-01-01', '2030-01-01', [1, 2, 3, 4, 5, 6, 7]).length).toBe(MAX_SERIES + 1)
  })
  it('texto de los días', () => {
    expect(weekdaysText([1, 3])).toBe('lunes y miércoles')
    expect(weekdaysText([1, 3, 5])).toBe('lunes, miércoles y viernes')
    expect(weekdaysText([3])).toBe('miércoles')
  })
})

describe('aviso de entrenos programados', () => {
  it('serie: sin nombres de jugadores', () => {
    const dates = seriesDates('2026-12-02', '2026-12-30', [1, 3])
    expect(trainingNoticeText({ team: 'Sub-15 Masculino', dates, weekdays: [1, 3], time: '15:30' }))
      .toBe('Se programaron 9 entrenos de Sub-15 Masculino: lunes y miércoles, 3:30 p. m., del 2 de diciembre al 30 de diciembre.')
  })
  it('un solo entreno', () => {
    expect(trainingNoticeText({ team: 'Sub-15 Masculino', dates: ['2026-12-02'], time: '07:00' }))
      .toBe('Se programó un entreno de Sub-15 Masculino: miércoles 2 de diciembre, 7:00 a. m.')
  })
})
