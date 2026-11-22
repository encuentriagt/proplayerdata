import { expect, test } from '@playwright/test'
import { mockApi } from './mockApi'

test('login → equipo → crear partido → convocar → ficha → publicar', async ({ page }) => {
  const api = mockApi(page)

  // Login con la marca de la organización
  await page.goto('/colegio-demo/login')
  await expect(page.getByText('Colegio Demo ppd')).toBeVisible()
  await expect(page.getByText('Powered by')).toBeVisible()
  await page.getByLabel('Correo electrónico').fill('coach@demo.gt')
  await page.getByLabel('Contraseña', { exact: true }).fill('mala')
  await page.getByRole('button', { name: 'Ingresar' }).click()
  await expect(page.getByText('Correo o contraseña incorrectos.')).toBeVisible()
  await page.getByLabel('Contraseña', { exact: true }).fill('Secreta12345')
  await page.getByRole('button', { name: 'Ingresar' }).click()
  await expect(page.getByRole('heading', { name: /Hola, Carlos/ })).toBeVisible()
  expect(api.calls.find((c) => c.path === 'auth/login')?.headers['x-app-platform']).toBe('web')
  // El token queda en sessionStorage (no se marcó "Mantener sesión")
  expect(await page.evaluate(() => sessionStorage.getItem('ppd.pc.token'))).toBe('tok-123')
  // Marca blanca aplicada
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--org-primary').trim())).toBe('#0B3D91')

  // Equipo
  await page.goto('/colegio-demo/equipos')
  await page.getByRole('link', { name: /Sub-15 Masculino/ }).click()
  await expect(page.getByText('Ana López')).toBeVisible()

  // Crear partido
  await page.getByRole('link', { name: 'Nueva actividad' }).click()
  await page.getByLabel('Inicio').fill('2026-11-20T09:00')
  await page.getByLabel('Rival').fill('Liceo Norte')
  await page.getByLabel('Condición').selectOption('home')
  await page.getByLabel('Lugar').fill('Cancha 1')
  await page.getByRole('button', { name: 'Crear actividad' }).click()
  await expect(page.getByRole('heading', { name: 'vs. Liceo Norte' })).toBeVisible()
  const create = api.calls.find((c) => c.method === 'POST' && c.path.endsWith('/events'))!
  expect(create.headers['idempotency-key']).toMatch(/^[0-9a-f-]{36}$/)
  expect(create.body).toMatchObject({ team_id: 1, type: 'match', starts_at: '2026-11-20 09:00', opponent_name: 'Liceo Norte' })

  // Convocar
  await page.getByRole('tab', { name: 'Convocatoria' }).click()
  await page.getByRole('group', { name: 'Convocatoria de Ana López' }).getByRole('button', { name: 'Convocado' }).click()
  await page.getByRole('group', { name: 'Convocatoria de Luis Pérez' }).getByRole('button', { name: 'Reserva' }).click()
  await page.getByRole('button', { name: 'Guarde la convocatoria' }).click()
  await expect(page.getByText(/Se avisó a los padres de 2 jugadores/)).toBeVisible()
  const callups = api.calls.find((c) => c.path.endsWith('/callups'))!
  expect(callups.body.players).toEqual([{ player_id: 15, status: 'called' }, { player_id: 18, status: 'reserve' }])

  // Ficha del partido
  await page.getByRole('tab', { name: 'Ficha' }).click()
  await page.getByRole('button', { name: 'Agregar Gol a Ana López' }).click()
  await page.getByRole('button', { name: 'Agregar Gol a Ana López' }).click()
  await page.getByRole('button', { name: 'Sumar a Nosotros' }).click()
  await page.getByRole('button', { name: 'Sumar a Liceo Norte' }).click()
  await expect(page.getByText('Sus jugadores suman 2.')).toBeVisible()
  // El borrador queda en el navegador mientras se edita
  expect(await page.evaluate(() => Object.keys(localStorage).some((k) => k.startsWith('ppd.pc.sheet.colegio-demo.')))).toBe(true)

  // Publicar (con confirmación); marcador 1–1 con 2 goles → aviso amarillo de la API
  await page.getByRole('button', { name: 'Publicar resultado' }).click()
  await expect(page.getByText('Se enviará el resultado a los padres. ¿Desea continuar?')).toBeVisible()
  await page.getByRole('button', { name: 'Publicar', exact: true }).click()
  await expect(page.getByText('Resultado publicado. Se avisó a los padres.')).toBeVisible()
  await expect(page.getByText(/no coincide con el marcador/)).toBeVisible()

  const sheet = api.calls.find((c) => c.path.endsWith('/match-sheet'))!
  expect(sheet.method).toBe('PUT')
  expect(sheet.headers['idempotency-key']).toBeTruthy()
  expect(sheet.body).toMatchObject({
    score_us: 1, score_them: 1, publish: true,
    lineup: [{ player_id: 15, is_starter: false, sport_position_id: 3, jersey_number: 9, minutes_played: null }],
    actions: [{ stat_code: 'goal', player_id: 15, value: 1 }, { stat_code: 'goal', player_id: 15, value: 1 }],
  })
  // Al publicar se borra el borrador local
  expect(await page.evaluate(() => Object.keys(localStorage).some((k) => k.startsWith('ppd.pc.sheet.colegio-demo.')))).toBe(false)
  // Ya publicado: un solo botón "Guardar corrección" (no hay borrador)
  await expect(page.getByRole('button', { name: 'Guardar corrección' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Guardar borrador' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Guardar corrección' }).click()
  await expect(page.getByText('Si cambió el marcador, se avisará a los padres.')).toBeVisible()
  await page.getByRole('button', { name: 'Guardar', exact: true }).click()
  await expect(page.getByText('Ficha corregida y publicada.')).toBeVisible()
  // La ficha usa el catálogo que trae el evento: no pide el equipo
  expect(api.calls.some((c) => c.path.endsWith('/teams/1') && c.method === 'GET' && c.headers.referer?.includes('/eventos/'))).toBe(false)
  // Inicio: ya no aparece como ficha pendiente
  await page.goto('/colegio-demo')
  await expect(page.getByText('No tiene partidos pendientes de ficha.')).toBeVisible()
  expect(api.calls.some((c) => c.path.endsWith('/events') && c.method === 'GET')).toBe(true)
})

test('olvidé mi contraseña y restablecer', async ({ page }) => {
  mockApi(page)
  await page.goto('/colegio-demo/login')
  await page.getByRole('link', { name: '¿Olvidó su contraseña?' }).click()
  await expect(page.getByRole('heading', { name: 'Recupere su contraseña' })).toBeVisible()
  await page.getByLabel('Correo electrónico').fill('coach@demo.gt')
  await page.getByRole('button', { name: 'Enviar enlace' }).click()
  await expect(page.getByText('Si el correo está registrado, recibirá un enlace para crear una nueva contraseña.')).toBeVisible()

  await page.goto('/colegio-demo/restablecer?token=vencido')
  await expect(page.getByText('El enlace no es válido o ya venció. Pida uno nuevo.')).toBeVisible()

  await page.goto('/colegio-demo/restablecer?token=bueno')
  await expect(page.getByText('co***@demo.gt')).toBeVisible()
  await page.getByLabel('Contraseña nueva').fill('Secreta12345')
  await page.getByLabel('Confirme la contraseña').fill('Secreta12345')
  await page.getByRole('button', { name: 'Guarde la contraseña' }).click()
  await expect(page.getByRole('heading', { name: /Hola, Carlos/ })).toBeVisible()
})

test('sin conexión con la API no dice que la organización no existe', async ({ page }) => {
  await page.route('**/api/**', (r) => r.abort('failed'))
  await page.goto('/colegio-demo/login')
  await expect(page.getByText('No se pudo conectar con el servidor.')).toBeVisible()
  await expect(page.getByText('No se encontró la organización.')).toHaveCount(0)
})

test('organización inactiva muestra el aviso', async ({ page }) => {
  await page.route('**/api/public/orgs/cerrado/branding', (r) => r.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ data: { name: 'Colegio Cerrado', slug: 'cerrado', type: 'school', active: false, logo_url: null, crest_url: null, cover_url: null, colors: { primary: null, secondary: null, on_primary: null }, powered_by: 'ppd' } }),
  }))
  await page.goto('/cerrado/login')
  await expect(page.getByText('Su organización no está activa. Comuníquese con su institución.')).toBeVisible()
})
