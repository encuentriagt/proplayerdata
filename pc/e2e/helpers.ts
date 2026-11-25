import { expect, type Page } from '@playwright/test'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

/** "Noviembre 2026" → 2026 * 12 + 10, para comparar meses. */
function indiceMes(texto: string): number {
  const [mes, anio] = texto.trim().toLowerCase().split(' ')
  return Number(anio) * 12 + MESES.indexOf(mes)
}

/** Elige la fecha en el calendario propio y la hora en el selector, como lo haría una persona. */
export async function fechaHora(page: Page, fecha: string, hora: string, labelHora = 'Hora') {
  const d = parseISO(fecha)
  await page.getByLabel('Fecha', { exact: true }).click()
  const calendario = page.getByRole('dialog', { name: /Elegir fecha/ })
  const objetivo = d.getFullYear() * 12 + d.getMonth()
  for (let i = 0; i < 36; i++) {
    const actual = indiceMes((await calendario.locator('[aria-live="polite"]').textContent()) ?? '')
    if (actual === objetivo) break
    await calendario.getByRole('button', { name: actual < objetivo ? 'Mes siguiente' : 'Mes anterior' }).click()
  }
  await calendario.getByRole('button', { name: format(d, "d 'de' MMMM 'de' yyyy", { locale: es }), exact: true }).click()
  await expect(calendario).toHaveCount(0)
  await page.getByLabel(labelHora, { exact: true }).selectOption(hora)
}
