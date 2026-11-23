import { expect, test } from '@playwright/test'
import { mockApi } from './mockApi'

test('selector de deporte: Inicio muestra el deporte y Partidos solo el elegido', async ({ page }) => {
  mockApi(page, 'org_admin') // ve Fútbol (Sub-15) y Básquetbol (Básquet Juvenil)
  await page.goto('/colegio-demo/login')
  await page.getByLabel('Correo electrónico').fill('admin@demo.gt')
  await page.getByLabel('Contraseña', { exact: true }).fill('Secreta12345')
  await page.getByRole('button', { name: 'Ingresar' }).click()
  await expect(page.getByRole('heading', { name: /Hola, Ana/ })).toBeVisible()

  // Un partido de cada deporte
  await page.evaluate(async () => {
    const d = new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10) + ' 10:00'
    for (const b of [{ team_id: 1, type: 'match', starts_at: d, opponent_name: 'Rival Fútbol' }, { team_id: 2, type: 'match', starts_at: d, opponent_name: 'Rival Básquet' }]) {
      await fetch('/api/pc/orgs/colegio-demo/events', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) })
    }
  })

  // Junto al saludo: el deporte con su ícono (orden alfabético: Básquetbol primero)
  const switcher = page.getByRole('button', { name: /Deporte: Básquetbol/ })
  await expect(switcher).toBeVisible()
  await expect(switcher).toContainText('🏀')

  await page.goto('/colegio-demo/partidos')
  await expect(page.getByText('vs. Rival Básquet')).toBeVisible()
  await expect(page.getByText('vs. Rival Fútbol')).toHaveCount(0)

  // Cambiar a Fútbol
  await page.getByRole('button', { name: /Cambiar deporte/ }).click()
  await page.getByRole('option', { name: /Fútbol/ }).click()
  await expect(page.getByText('vs. Rival Fútbol')).toBeVisible()
  await expect(page.getByText('vs. Rival Básquet')).toHaveCount(0)
  await expect(page.getByLabel('Filtrar por equipo').locator('option')).toHaveText(['Todos los equipos', 'Sub-15 Masculino'])

  // Se recuerda al volver a Inicio
  await page.goto('/colegio-demo')
  await expect(page.getByRole('button', { name: /Deporte: Fútbol/ })).toContainText('⚽')
})

test('con un solo deporte se muestra el ícono sin menú', async ({ page }) => {
  mockApi(page, 'coach') // solo Fútbol
  await page.goto('/colegio-demo/login')
  await page.getByLabel('Correo electrónico').fill('coach@demo.gt')
  await page.getByLabel('Contraseña', { exact: true }).fill('Secreta12345')
  await page.getByRole('button', { name: 'Ingresar' }).click()
  await expect(page.getByLabel('Deporte: Fútbol')).toContainText('⚽')
  await expect(page.getByRole('button', { name: /Cambiar deporte/ })).toHaveCount(0)
})
