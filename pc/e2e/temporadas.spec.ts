import { expect, test } from '@playwright/test'
import { mockApi } from './mockApi'

test('Temporadas: chip del ciclo, avance y aviso del ciclo al elegir fechas', async ({ page }) => {
  mockApi(page, 'org_admin')
  await page.goto('/colegio-demo/login')
  await page.getByLabel('Correo electrónico').fill('admin@demo.gt')
  await page.getByLabel('Contraseña', { exact: true }).fill('Secreta12345')
  await page.getByRole('button', { name: 'Ingresar' }).click()
  await expect(page.getByRole('heading', { name: /Hola/ })).toBeVisible()
  await page.goto('/colegio-demo/admin/temporadas')

  await expect(page.getByText('Ciclo americano')).toBeVisible()
  await expect(page.getByText('Ciclo guatemalteco')).toHaveCount(2)
  const actual = page.getByRole('progressbar', { name: 'Avance de 2026-2027' })
  await expect(actual).toHaveAttribute('aria-valuetext', /^\d+(\.\d)? % · falta/)
  await expect(page.getByText('Finalizada')).toBeVisible()
  await expect(page.getByText(/^Por empezar · dura \d+ días$/)).toBeVisible()

  await page.getByRole('button', { name: 'Nueva temporada' }).click()
  await page.getByRole('dialog').getByLabel('Nombre').fill('2027')
  await page.getByRole('dialog').getByLabel('Inicio', { exact: true }).fill('2027-01-10')
  await page.getByRole('dialog').getByLabel('Fin', { exact: true }).fill('2027-10-30')
  await expect(page.getByText('Empieza y termina en 2027: es ciclo guatemalteco.')).toBeVisible()
  await page.getByRole('dialog').getByLabel('Fin', { exact: true }).fill('2028-06-30')
  await expect(page.getByText('Empieza en 2027 y termina en 2028: es ciclo americano.')).toBeVisible()
  await page.getByRole('dialog').getByLabel('Fin', { exact: true }).fill('2026-06-30')
  await expect(page.getByText('La fecha de fin debe ser posterior al inicio.')).toBeVisible()
})
