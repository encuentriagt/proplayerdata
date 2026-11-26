import { expect, test } from '@playwright/test'
import { mockApi } from './mockApi'

test('inicio sin sesión: continúa al último colegio usado, sin buscador', async ({ page }) => {
  mockApi(page)
  await page.addInitScript(() => localStorage.setItem('ppd.pc.lastOrg', 'colegio-demo'))
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Plataforma Coach' })).toBeVisible()
  await expect(page.getByRole('searchbox')).toHaveCount(0)
  await expect(page.getByRole('textbox')).toHaveCount(0)
  await page.getByRole('link', { name: /Continuar a Colegio Demo ppd/ }).click()
  await expect(page).toHaveURL(/\/colegio-demo\/login$/)
  await expect(page.getByRole('button', { name: 'Ingresar' })).toBeVisible()
})

test('inicio sin sesión: sin colegio guardado pide el enlace', async ({ page }) => {
  mockApi(page)
  await page.goto('/')
  await expect(page.getByText('Último colegio usado')).toHaveCount(0)
  await expect(page.getByText('pídalo a su coordinador')).toBeVisible()
})
