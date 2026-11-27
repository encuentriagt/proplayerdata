import { expect, test } from '@playwright/test'
import { mockApi } from './mockApi'

test('Calendario: un equipo, varios o todos los equipos', async ({ page }) => {
  mockApi(page, 'org_admin')
  // Dos equipos de fútbol para poder combinarlos
  const soccer = { id: 1, code: 'soccer', name: 'Soccer' }
  await page.route((u) => u.pathname.endsWith('/api/pc/orgs/colegio-demo/teams'), (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ data: [
      { id: 1, name: 'Sub-15 Masculino', category: 'Sub-15', gender: 'male', color: '#0B3D91', sport: soccer, season: null, can_manage: true },
      { id: 3, name: 'Sub-17 Femenino', category: 'Sub-17', gender: 'female', color: '#B3261E', sport: soccer, season: null, can_manage: true },
      { id: 4, name: 'Sub-13 Mixto', category: 'Sub-13', gender: 'mixed', color: '#25984D', sport: soccer, season: null, can_manage: true },
    ] }),
  }))
  await page.goto('/colegio-demo/login')
  await page.getByLabel('Correo electrónico').fill('admin@demo.gt')
  await page.getByLabel('Contraseña', { exact: true }).fill('Secreta12345')
  await page.getByRole('button', { name: 'Ingresar' }).click()
  await expect(page.getByRole('heading', { name: /Hola/ })).toBeVisible()

  await page.evaluate(async () => {
    const d = new Date(Date.now() - 6 * 3600e3 + 2 * 864e5).toISOString().slice(0, 10)
    for (const [team_id, location] of [[1, 'Cancha A'], [3, 'Cancha B'], [4, 'Cancha C']] as const) {
      await fetch('/api/pc/orgs/colegio-demo/events', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ team_id, type: 'training', starts_at: `${d} 16:00`, location, publish: true, callups: [{ player_id: 15 }] }) })
    }
  })

  await page.goto('/colegio-demo/calendario?vista=lista')
  const lista = page.locator('main')
  const picker = page.getByRole('button', { name: /^Equipos:/ })

  // Todos los equipos (por defecto)
  await expect(picker).toHaveAccessibleName('Equipos: Todos los equipos')
  for (const c of ['Cancha A', 'Cancha B', 'Cancha C']) await expect(lista.getByText(c)).toBeVisible()

  // Un solo equipo
  await picker.click()
  await page.getByRole('checkbox', { name: 'Sub-15 Masculino' }).waitFor({ state: 'attached' })
  await page.getByRole('button', { name: 'Solo Sub-17 Femenino' }).click()
  await expect(picker).toHaveAccessibleName('Equipos: Sub-17 Femenino')
  await expect(lista.getByText('Cancha B')).toBeVisible()
  await expect(lista.getByText('Cancha A')).toHaveCount(0)
  await expect(page).toHaveURL(/equipos=3/)

  // Varios equipos
  await picker.click()
  await page.getByText('Sub-15 Masculino', { exact: true }).click()
  await expect(picker).toHaveAccessibleName('Equipos: 2 equipos')
  await expect(lista.getByText('Cancha A')).toBeVisible()
  await expect(lista.getByText('Cancha B')).toBeVisible()
  await expect(lista.getByText('Cancha C')).toHaveCount(0)

  // Marcar el que falta equivale a todos
  await page.getByText('Sub-13 Mixto', { exact: true }).click()
  await expect(picker).toHaveAccessibleName('Equipos: Todos los equipos')
  await expect(lista.getByText('Cancha C')).toBeVisible()

  // Volver a "Todos los equipos" desde una selección
  await page.getByText('Sub-13 Mixto', { exact: true }).click()
  await expect(picker).toHaveAccessibleName('Equipos: 2 equipos')
  await page.getByText('Todos los equipos', { exact: true }).click()
  await expect(picker).toHaveAccessibleName('Equipos: Todos los equipos')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('checkbox', { name: 'Sub-15 Masculino' })).toHaveCount(0)
})
