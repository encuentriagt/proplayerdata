import { expect, test, type Page } from '@playwright/test'
import { mockApi } from './mockApi'

async function entrar(page: Page) {
  await page.goto('/colegio-demo/login')
  await page.getByLabel('Correo electrónico').fill('x@demo.gt')
  await page.getByLabel('Contraseña', { exact: true }).fill('Secreta12345')
  await page.getByRole('button', { name: 'Ingresar' }).click()
  await expect(page.getByRole('heading', { name: /Hola/ })).toBeVisible()
}

test('admin: activa un deporte del catálogo y aparece en el selector', async ({ page }) => {
  const api = mockApi(page, 'org_admin')
  await entrar(page)
  await page.goto('/colegio-demo/admin/deportes')
  await expect(page.getByRole('heading', { name: 'Deportes' })).toBeVisible()
  // Los que tienen equipos no se pueden desactivar
  await expect(page.getByRole('checkbox', { name: /Soccer/ })).toBeDisabled()
  await expect(page.getByText('1 equipo · no se puede desactivar').first()).toBeVisible()
  // Activar Volleyball
  await page.getByText('Volleyball').click()
  await page.getByRole('button', { name: 'Guarde los deportes' }).click()
  await expect(page.getByText('Deportes guardados.')).toBeVisible()
  expect(api.calls.find((c) => c.method === 'PUT' && c.path.endsWith('/sports'))?.body).toEqual({ sport_ids: [1, 2, 3] })
  // El selector de deporte ahora lo ofrece (aunque aún no tenga equipos)
  await page.goto('/colegio-demo')
  await page.getByRole('button', { name: /Cambiar deporte/ }).click()
  await expect(page.getByRole('option', { name: /Volleyball/ })).toBeVisible()
})

test('las listas piden a la API solo el deporte elegido (sport_id)', async ({ page }) => {
  const api = mockApi(page, 'org_admin')
  await entrar(page)
  await page.goto('/colegio-demo/partidos')
  await expect(page.getByRole('heading', { name: 'Partidos' })).toBeVisible()
  // Soccer (id 1) es el primero; la lista se pide con sport_id=1
  await expect.poll(() => api.calls.filter((c) => c.method === 'GET' && c.path.endsWith('/events')).at(-1)?.query.get('sport_id')).toBe('1')
  await page.getByRole('button', { name: /Cambiar deporte/ }).click()
  await page.getByRole('option', { name: /Basketball/ }).click()
  await expect.poll(() => api.calls.filter((c) => c.method === 'GET' && c.path.endsWith('/events')).at(-1)?.query.get('sport_id')).toBe('2')
  // Inicio también: fichas pendientes y próximas con sport_id
  await page.goto('/colegio-demo')
  await expect.poll(() => api.calls.some((c) => c.query.get('pending_sheet') === '1' && c.query.get('sport_id') === '2')).toBe(true)
})

test('director y coach: sin pestaña Deportes', async ({ page }) => {
  mockApi(page, 'director')
  await entrar(page)
  await page.goto('/colegio-demo/admin/deportes')
  await expect(page.getByRole('navigation', { name: /dministración/ }).getByRole('link', { name: 'Deportes' })).toHaveCount(0)
  await expect(page).not.toHaveURL(/deportes/)
})
