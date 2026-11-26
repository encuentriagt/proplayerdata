import { expect, test } from '@playwright/test'
import { mockApi } from './mockApi'

test('inicio sin sesión: último colegio usado y buscador de instituciones', async ({ page }) => {
  mockApi(page)
  await page.addInitScript(() => localStorage.setItem('ppd.pc.lastOrg', 'colegio-demo'))
  await page.goto('/')

  await expect(page.getByRole('heading', { name: 'Plataforma Coach' })).toBeVisible()
  await expect(page.getByText('Último colegio usado')).toBeVisible()
  await expect(page.getByRole('link', { name: /Continuar a Colegio Demo ppd/ })).toHaveAttribute('href', '/colegio-demo/login')

  const buscar = page.getByLabel('¿No tiene el enlace? Busque su institución')
  await buscar.fill('a')
  await page.getByRole('button', { name: 'Buscar' }).click()
  await expect(page.getByText('Escriba al menos dos letras')).toBeVisible()

  await buscar.fill('liceo')
  await page.getByRole('button', { name: 'Buscar' }).click()
  const lista = page.getByRole('list', { name: 'Instituciones encontradas' })
  await expect(lista.getByRole('button')).toHaveCount(1)
  await expect(lista.getByRole('button', { name: /Liceo Altamira/ })).toBeVisible()

  await buscar.fill('zzz')
  await page.getByRole('button', { name: 'Buscar' }).click()
  await expect(page.getByText('No encontramos esa institución.')).toBeVisible()

  await buscar.fill('demo')
  await page.getByRole('button', { name: 'Buscar' }).click()
  await lista.getByRole('button', { name: /Colegio Demo ppd/ }).click()
  await expect(page).toHaveURL(/\/colegio-demo\/login$/)
  await expect(page.getByRole('button', { name: 'Ingresar' })).toBeVisible()
})

test('inicio sin sesión: si la API aún no tiene buscador, busca por el identificador', async ({ page }) => {
  mockApi(page)
  await page.route((u) => u.pathname.endsWith('/api/public/orgs'), (route) =>
    route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: { code: 'not_found', message: 'No existe.' } }) }),
  )
  await page.goto('/')
  await expect(page.getByText('Último colegio usado')).toHaveCount(0)
  await page.getByLabel('¿No tiene el enlace? Busque su institución').fill('Colegio Demo')
  await page.getByRole('button', { name: 'Buscar' }).click()
  await expect(page.getByRole('list', { name: 'Instituciones encontradas' }).getByRole('button', { name: /Colegio Demo ppd/ })).toBeVisible()
})
