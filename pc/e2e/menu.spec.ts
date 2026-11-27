import { expect, test } from '@playwright/test'
import { mockApi } from './mockApi'

test('escritorio: el menú lateral entra plegado (solo íconos) y se puede desplegar', async ({ page }, info) => {
  test.skip(info.project.name !== 'escritorio', 'El menú plegable es solo de escritorio')
  mockApi(page, 'org_admin')
  await page.goto('/colegio-demo/login')
  await page.getByLabel('Correo electrónico').fill('admin@demo.gt')
  await page.getByLabel('Contraseña', { exact: true }).fill('Secreta12345')
  await page.getByRole('button', { name: 'Ingresar' }).click()
  await expect(page.getByRole('heading', { name: /Hola/ })).toBeVisible()

  const menu = page.locator('#menu-lateral')
  const toggle = page.getByRole('button', { name: 'Desplegar menú' })
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await expect(menu.getByText('Colegio Demo ppd')).toHaveCount(0)
  // El texto queda solo para lectores de pantalla (sr-only, 1 px)
  expect((await menu.getByText('Partidos', { exact: true }).boundingBox())!.width).toBeLessThanOrEqual(1)
  expect((await menu.boundingBox())!.width).toBeLessThan(80)

  // Con el menú plegado los íconos siguen funcionando
  await menu.getByRole('link', { name: 'Partidos' }).click()
  await expect(page).toHaveURL(/\/colegio-demo\/partidos$/)

  // Administración: con el menú plegado, los apartados salen como pestañas en la página
  await menu.getByRole('link', { name: 'Administración' }).click()
  await expect(page.getByRole('navigation', { name: 'Administración', exact: true })).toBeVisible()

  await toggle.click()
  await expect(page.getByRole('button', { name: 'Plegar menú' })).toHaveAttribute('aria-expanded', 'true')
  await expect(menu.getByText('Colegio Demo ppd')).toBeVisible()
  await expect(menu.getByText('Partidos', { exact: true })).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Administración', exact: true })).not.toBeVisible()
  expect((await menu.boundingBox())!.width).toBeGreaterThan(200)
})
