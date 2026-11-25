import { expect, test, type Page } from '@playwright/test'
import { mockApi } from './mockApi'

async function entrar(page: Page) {
  await page.goto('/colegio-demo/login')
  await page.getByLabel('Correo electrónico').fill('coach@demo.gt')
  await page.getByLabel('Contraseña', { exact: true }).fill('Secreta12345')
  await page.getByRole('button', { name: 'Ingresar' }).click()
  await expect(page.getByRole('heading', { name: /Hola/ })).toBeVisible()
}
const manana = () => new Date(Date.now() + 864e5).toISOString().slice(0, 10)

test('Borrador: se guarda sin publicar, se ve gris con "No publicado", se edita y se publica', async ({ page }) => {
  const api = mockApi(page)
  await entrar(page)
  await page.goto('/colegio-demo/eventos/nuevo?tipo=match')
  await page.getByLabel('Fecha y hora').fill(`${manana()}T10:00`)
  await page.getByLabel('Rival').fill('Colegio Sur')
  await page.getByRole('button', { name: 'Convocar jugadores' }).click()
  await page.getByRole('checkbox', { name: /Ana López/ }).check()
  await page.getByRole('button', { name: 'Borrador', exact: true }).click()

  await expect(page.getByText('Borrador guardado. No se avisó a nadie')).toBeVisible()
  expect(api.calls.find((c) => c.method === 'POST' && c.path.endsWith('/events'))?.body).toMatchObject({ publish: false, callups: [{ player_id: 15, status: 'called' }] })
  // La ficha no se puede llenar en borrador
  await page.getByRole('tab', { name: 'Ficha' }).click()
  await expect(page.getByText('Publique el partido para poder llenar la ficha.')).toBeVisible()

  // En Partidos: tarjeta con "No publicado"
  await page.goto('/colegio-demo/partidos')
  await expect(page.getByText('No publicado')).toBeVisible()

  // Editar el borrador: conserva la convocatoria; agrega a Luis y guarda + publica
  await page.getByRole('button', { name: /Opciones de Sub-15 Masculino vs Colegio Sur/ }).click()
  await page.getByRole('menuitem', { name: 'Editar' }).click()
  await expect(page.getByRole('heading', { name: 'Editar borrador' })).toBeVisible()
  await page.getByRole('button', { name: 'Convocar jugadores' }).click()
  await expect(page.getByRole('checkbox', { name: /Ana López/ })).toBeChecked()
  await page.getByRole('checkbox', { name: /Luis Pérez/ }).check()
  await page.getByRole('button', { name: 'Guardar y publicar' }).click()
  await expect(page.getByText(/Partido publicado. Se avisó en la App a los padres de 2 convocados/)).toBeVisible()
  expect(api.calls.find((c) => c.method === 'PUT' && c.path.endsWith('/callups'))?.body.players).toHaveLength(2)
  const pub = api.calls.find((c) => c.method === 'POST' && c.path.endsWith('/publish'))!
  expect(pub.headers['idempotency-key']).toBeTruthy()
  await page.goto('/colegio-demo/partidos')
  await expect(page.getByText('No publicado')).toHaveCount(0)
})

test('Publicar un borrador desde el detalle', async ({ page }) => {
  const api = mockApi(page)
  await entrar(page)
  await page.goto('/colegio-demo/eventos/nuevo?tipo=match')
  await page.getByLabel('Fecha y hora').fill(`${manana()}T10:00`)
  await page.getByLabel('Rival').fill('Liceo Norte')
  await page.getByRole('button', { name: 'Borrador', exact: true }).click()
  await page.getByRole('button', { name: 'Publicar', exact: true }).click()
  await expect(page.getByText('¿Publicar este partido?')).toBeVisible()
  await page.getByRole('dialog').getByRole('button', { name: 'Publicar' }).click()
  await expect(page.getByText('Es un borrador: los padres no lo ven')).toHaveCount(0)
  expect(api.calls.some((c) => c.method === 'POST' && c.path.endsWith('/publish'))).toBe(true)
})

test('Menú ⋮ en las tarjetas de Partidos: Editar y Eliminar', async ({ page }) => {
  const api = mockApi(page)
  await entrar(page)
  await page.goto('/colegio-demo/eventos/nuevo?tipo=match')
  await page.getByLabel('Fecha y hora').fill(`${manana()}T10:00`)
  await page.getByLabel('Rival').fill('Instituto Este')
  await page.getByRole('button', { name: 'Crear partido y publicar' }).click()
  await page.goto('/colegio-demo/partidos')

  const menu = page.getByRole('button', { name: 'Opciones de Sub-15 Masculino vs Instituto Este' })
  await menu.click()
  await page.getByRole('menuitem', { name: 'Editar' }).click()
  await expect(page.getByRole('heading', { name: 'Editar partido' })).toBeVisible()
  await page.goto('/colegio-demo/partidos')

  await menu.click()
  await page.getByRole('menuitem', { name: 'Eliminar' }).click()
  await expect(page.getByText('¿Eliminar este partido?')).toBeVisible()
  await page.getByRole('dialog').getByRole('button', { name: 'Eliminar' }).click()
  await expect(page.getByText('Sub-15 Masculino vs Instituto Este')).toHaveCount(0)
  expect(api.calls.some((c) => c.method === 'DELETE' && /\/events\/\d+$/.test(c.path))).toBe(true)
})

test('Posiciones: el coach agrega, renombra, ordena y no puede borrar una en uso', async ({ page }) => {
  const api = mockApi(page)
  await entrar(page)
  await page.goto('/colegio-demo/equipos')
  await page.getByRole('link', { name: 'Posiciones' }).click()
  await expect(page.getByRole('heading', { name: 'Posiciones' })).toBeVisible()
  await expect(page.getByText('Portero')).toBeVisible()

  await page.getByLabel('Nueva posición').fill('Volante')
  await page.getByRole('button', { name: 'Agregar' }).click()
  await expect(page.getByText('Volante')).toBeVisible()
  expect(api.calls.find((c) => c.method === 'POST' && c.path.endsWith('/sports/1/positions'))?.body).toEqual({ name: 'Volante' })

  await page.getByRole('button', { name: 'Renombrar Volante' }).click()
  await page.getByLabel('Nuevo nombre de Volante').fill('Volante mixto')
  await page.getByRole('button', { name: 'Guardar nombre' }).click()
  await expect(page.getByText('Volante mixto')).toBeVisible()

  await page.getByRole('button', { name: 'Subir Volante mixto' }).click()
  await expect.poll(() => api.calls.filter((c) => c.method === 'PATCH' && /\/positions\/\d+$/.test(c.path)).length).toBeGreaterThanOrEqual(3)

  // Delantero la usa un jugador: la API responde position_in_use
  await page.getByRole('button', { name: 'Borrar Delantero' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Borrar' }).click()
  await expect(page.getByText(/La usan 1 jugador/)).toBeVisible()
  await expect(page.getByText('Delantero').first()).toBeVisible()
})
