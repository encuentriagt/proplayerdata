import { expect, test, type Page } from '@playwright/test'
import { mockApi } from './mockApi'

async function entrar(page: Page) {
  await page.goto('/colegio-demo/login')
  await page.getByLabel('Correo electrónico').fill('x@demo.gt')
  await page.getByLabel('Contraseña', { exact: true }).fill('Secreta12345')
  await page.getByRole('button', { name: 'Ingresar' }).click()
  await expect(page.getByRole('heading', { name: /Hola/ })).toBeVisible()
}

async function abrirMenu(page: Page) {
  const btn = page.getByRole('button', { name: 'Abrir menú' })
  if (await btn.isVisible()) await btn.click()
}

test('coach: sin Administración y sin acceso por URL', async ({ page }) => {
  mockApi(page, 'coach')
  await entrar(page)
  await abrirMenu(page)
  await expect(page.getByRole('link', { name: 'Administración' })).toHaveCount(0)
  await page.goto('/colegio-demo/admin/miembros')
  await expect(page.getByRole('heading', { name: /Hola/ })).toBeVisible()
  await page.goto('/colegio-demo/equipos')
  await expect(page.getByRole('link', { name: /Crear o administrar equipos/ })).toHaveCount(0)
})

test('director técnico: sus coaches, crear equipos solo de su deporte, sin temporadas/planes/marca', async ({ page }) => {
  mockApi(page, 'director')
  await entrar(page)
  await abrirMenu(page)
  await page.getByRole('link', { name: 'Administración' }).click()
  const nav = page.getByRole('navigation', { name: /dministración/ })
  await expect(nav.getByRole('link', { name: 'Miembros' })).toBeVisible()
  await expect(nav.getByRole('link', { name: 'Equipos' })).toBeVisible()
  for (const n of ['Temporadas', 'Planes', 'Marca']) await expect(nav.getByRole('link', { name: n })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Mis coaches' })).toBeVisible()

  // Invitar: solo coach (no puede invitar directores ni admins)
  await page.getByRole('button', { name: 'Invitar coach' }).click()
  await expect(page.getByText('Rol: Coach')).toBeVisible()
  await page.getByRole('button', { name: 'Cerrar', exact: true }).click()

  // Equipos: solo puede administrar los de su alcance (Soccer); crear solo en Soccer
  await nav.getByRole('link', { name: 'Equipos' }).click()
  await expect(page.getByRole('button', { name: 'Editar Sub-15 Masculino' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Editar Básquet Juvenil' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Crear equipo' }).click()
  // toHaveText reintenta hasta que carga el catálogo (evita leer la lista vacía)
  await expect(page.getByLabel('Deporte').locator('option')).toHaveText(['Elija un deporte', 'Soccer'])
  await page.getByRole('button', { name: 'Cancelar' }).click()

  // Sin create_players_without_team: el equipo es obligatorio
  await page.goto('/colegio-demo/jugadores')
  await page.getByRole('button', { name: 'Nuevo jugador' }).click()
  await expect(page.getByLabel('Equipo', { exact: true })).toBeVisible()
  await expect(page.getByRole('option', { name: 'Sin equipo por ahora' })).toHaveCount(0)
})

test('admin: puede registrar un jugador sin equipo', async ({ page }) => {
  mockApi(page, 'org_admin')
  await entrar(page)
  await page.goto('/colegio-demo/jugadores')
  await page.getByRole('button', { name: 'Nuevo jugador' }).click()
  await expect(page.getByLabel('Equipo (opcional)')).toHaveValue('')
  await expect(page.getByRole('option', { name: 'Sin equipo por ahora' })).toHaveCount(1)
})

test('admin: asigna deportes y equipos a un director técnico', async ({ page }) => {
  const api = mockApi(page, 'org_admin')
  await entrar(page)
  await page.goto('/colegio-demo/admin/miembros')
  await expect(page.getByText('Alcance: Soccer (todo el deporte)')).toBeVisible()
  await page.getByRole('button', { name: 'Asignar deportes/equipos' }).click()
  // Agrega el equipo suelto de básquet
  await page.getByRole('checkbox', { name: /Básquet Juvenil/ }).check()
  await page.getByRole('button', { name: 'Guardar alcance' }).click()
  await expect(page.getByText('Alcance: Soccer (todo el deporte) · Básquet Juvenil')).toBeVisible()
  const put = api.calls.find((c) => c.method === 'PUT' && c.path.endsWith('/members/3/scopes'))!
  expect(put.body).toEqual({ sport_ids: [1], team_ids: [2] })

  // Invitar director exige al menos un deporte o equipo
  await page.getByRole('button', { name: 'Invitar miembro' }).click()
  await page.getByLabel('Correo').fill('nuevo@demo.gt')
  await page.getByLabel('Rol').selectOption('director')
  await expect(page.getByRole('button', { name: 'Crear invitación' })).toBeDisabled()
  await page.getByRole('dialog').getByRole('checkbox', { name: 'Basketball', exact: true }).check()
  await expect(page.getByRole('button', { name: 'Crear invitación' })).toBeEnabled()
})
