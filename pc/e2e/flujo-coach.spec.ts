import { expect, test, type Page } from '@playwright/test'
import { mockApi } from './mockApi'
import { fechaHora } from './helpers'

/** Para publicar hace falta al menos un convocado (regla del dueño). */
async function convocar(page: Page, nombre = 'Ana López') {
  const btn = page.getByRole('button', { name: 'Convocar jugadores' })
  if (await btn.isVisible()) await btn.click()
  await page.getByRole('checkbox', { name: new RegExp(nombre) }).check()
}

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
  await fechaHora(page, '2026-11-20', '09:00')
  await page.getByLabel('Rival').fill('Liceo Norte')
  await page.getByLabel('Lugar').fill('Cancha 1')
  await convocar(page, 'Luis Pérez')
  await page.getByRole('button', { name: 'Crear partido y publicar' }).click()
  await expect(page.getByRole('heading', { name: 'Sub-15 Masculino vs Liceo Norte' })).toBeVisible()
  const create = api.calls.find((c) => c.method === 'POST' && c.path.endsWith('/events'))!
  expect(create.headers['idempotency-key']).toMatch(/^[0-9a-f-]{36}$/)
  expect(create.body).toMatchObject({ team_id: 1, type: 'match', starts_at: '2026-11-20 09:00', opponent_name: 'Liceo Norte' })

  // Convocar
  await page.getByRole('tab', { name: 'Convocatoria' }).click()
  await page.getByRole('group', { name: 'Convocatoria de Ana López' }).getByRole('button', { name: 'Convocado' }).click()
  await page.getByRole('group', { name: 'Convocatoria de Luis Pérez' }).getByRole('button', { name: 'Reserva' }).click()
  await page.getByRole('button', { name: 'Guarde la convocatoria' }).click()
  await expect(page.getByText(/Se avisó a los padres de 1 jugador\b/)).toBeVisible()
  const callups = api.calls.find((c) => c.path.endsWith('/callups'))!
  expect(callups.body.players).toEqual([{ player_id: 15, status: 'called' }, { player_id: 18, status: 'reserve' }])

  // Ficha del partido
  await page.getByRole('tab', { name: 'Ficha' }).click()
  // Sin asistencia, autogol ni atajada; nuestro marcador no tiene + ni −: se suma con los goles
  await expect(page.getByRole('button', { name: /Agregar Asistencia/ })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Sumar a Nosotros' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Restar a Nosotros' })).toHaveCount(0)
  const nuestro = page.getByRole('status', { name: 'Marcador de Nosotros' })
  await expect(nuestro).toHaveText('0')
  await page.getByRole('button', { name: 'Agregar Gol a Ana López' }).click()
  await page.getByRole('button', { name: 'Agregar Gol a Ana López' }).click()
  await expect(nuestro).toHaveText('2')
  await page.getByRole('button', { name: 'Quitar Gol a Ana López' }).click()
  await expect(nuestro).toHaveText('1')
  await page.getByRole('button', { name: 'Agregar Gol a Ana López' }).click()
  await expect(nuestro).toHaveText('2')
  await page.getByRole('button', { name: 'Sumar a Liceo Norte' }).click()
  // El borrador queda en el navegador mientras se edita
  expect(await page.evaluate(() => Object.keys(localStorage).some((k) => k.startsWith('ppd.pc.sheet.colegio-demo.')))).toBe(true)

  // Publicar (con confirmación); marcador 2–1
  await page.getByRole('button', { name: 'Publicar resultado' }).click()
  await expect(page.getByText('Se enviará el resultado a los padres. ¿Desea continuar?')).toBeVisible()
  await page.getByRole('button', { name: 'Publicar', exact: true }).click()
  await expect(page.getByText('Resultado publicado. Se avisó a los padres.')).toBeVisible()
  await expect(page.getByText(/no coincide con el marcador/)).toHaveCount(0)

  const sheet = api.calls.find((c) => c.path.endsWith('/match-sheet'))!
  expect(sheet.method).toBe('PUT')
  expect(sheet.headers['idempotency-key']).toBeTruthy()
  expect(sheet.body).toMatchObject({
    score_us: 2, score_them: 1, publish: true,
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

test('Inicio → Partidos y Entrenos por separado, con lista y botón de nuevo', async ({ page }) => {
  const api = mockApi(page)
  await page.goto('/colegio-demo/login')
  await page.getByLabel('Correo electrónico').fill('coach@demo.gt')
  await page.getByLabel('Contraseña', { exact: true }).fill('Secreta12345')
  await page.getByRole('button', { name: 'Ingresar' }).click()
  await expect(page.getByRole('heading', { name: /Hola/ })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Nueva actividad' })).toHaveCount(0)

  // Partidos: lista vacía → nuevo partido → aparece en la lista
  await page.getByRole('main').getByRole('link', { name: 'Partidos' }).click()
  await expect(page.getByRole('heading', { name: 'Partidos' })).toBeVisible()
  await expect(page.getByText('No hay partidos programados.')).toBeVisible()
  await page.getByRole('link', { name: 'Nuevo partido' }).first().click()
  await expect(page.getByRole('heading', { name: 'Nuevo partido' })).toBeVisible()
  // Desde Partidos el formulario es solo de partido: no se ofrece Entrenamiento ni Otro
  await expect(page.getByRole('group', { name: 'Tipo' })).toHaveCount(0)
  await expect(page.getByText('Entrenamiento', { exact: true })).toHaveCount(0)
  const manana = new Date(Date.now() - 6 * 3600e3 + 864e5).toISOString().slice(0, 10) // en hora de Guatemala
  await page.getByLabel('Equipo').selectOption('1')
  await fechaHora(page, manana, '10:00')
  await page.getByLabel('Rival').fill('Colegio Sur')
  await convocar(page)
  await page.getByRole('button', { name: 'Crear partido y publicar' }).click()
  await expect(page.getByRole('heading', { name: 'Sub-15 Masculino vs Colegio Sur' })).toBeVisible()
  expect(api.calls.find((c) => c.method === 'POST' && c.path.endsWith('/events'))?.body.type).toBe('match')

  // Desde el detalle, "Volver" regresa a la lista de partidos (el formulario se reemplazó al crear)
  await page.getByRole('button', { name: 'Volver' }).click()
  await expect(page.getByRole('heading', { name: 'Partidos' })).toBeVisible()
  await expect(page.getByText('vs Colegio Sur')).toBeVisible()
  // Y "Inicio" lleva al menú principal
  await page.getByRole('link', { name: 'Inicio', exact: true }).first().click()
  await expect(page.getByRole('heading', { name: /Hola/ })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Volver' })).toHaveCount(0)
  // El logo del encabezado también lleva a Inicio
  await page.goto('/colegio-demo/partidos')
  await page.getByRole('link', { name: /ir al inicio/ }).first().click()
  await expect(page.getByRole('heading', { name: /Hola/ })).toBeVisible()
  await page.goto('/colegio-demo/partidos')
  expect(api.calls.some((c) => c.path.endsWith('/events') && c.method === 'GET')).toBe(true)

  // Entrenos: el partido no aparece; "Nuevo entreno" abre el formulario con el tipo entreno
  await page.goto('/colegio-demo/entrenos')
  await expect(page.getByRole('heading', { name: 'Entrenos' })).toBeVisible()
  await expect(page.getByText('vs Colegio Sur')).toHaveCount(0)
  await page.getByRole('link', { name: 'Nuevo entreno' }).first().click()
  await expect(page.getByRole('heading', { name: 'Nuevo entreno' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Crear entreno' })).toBeVisible()
  // Desde Entrenos: sin selector de tipo y sin campos de partido
  await expect(page.getByRole('group', { name: 'Tipo' })).toHaveCount(0)
  await expect(page.getByLabel('Rival')).toHaveCount(0)

  // En "Nueva actividad" del Calendario sí se elige el tipo (incluye "Otro")
  await page.goto('/colegio-demo/eventos/nuevo')
  await expect(page.getByRole('group', { name: 'Tipo' })).toBeVisible()
  await expect(page.getByText('Otro', { exact: true })).toBeVisible()
})

test('Nuevo partido: sin fin, condición ni título; convocar y "Crear partido y publicar"', async ({ page }) => {
  const api = mockApi(page)
  await page.goto('/colegio-demo/login')
  await page.getByLabel('Correo electrónico').fill('coach@demo.gt')
  await page.getByLabel('Contraseña', { exact: true }).fill('Secreta12345')
  await page.getByRole('button', { name: 'Ingresar' }).click()
  await expect(page.getByRole('heading', { name: /Hola/ })).toBeVisible()

  await page.goto('/colegio-demo/eventos/nuevo?tipo=match')
  await expect(page.getByRole('heading', { name: 'Nuevo partido' })).toBeVisible()
  for (const campo of ['Fin (opcional)', 'Condición', 'Título (opcional)']) await expect(page.getByLabel(campo)).toHaveCount(0)

  const manana = new Date(Date.now() - 6 * 3600e3 + 864e5).toISOString().slice(0, 10) // en hora de Guatemala
  await fechaHora(page, manana, '10:00')
  // Sin rival no se puede publicar
  await expect(page.getByRole('button', { name: 'Crear partido y publicar' })).toBeDisabled()
  await page.getByLabel('Rival').fill('Colegio Sur')
  await expect(page.getByText('Se verá como: Sub-15 Masculino vs Colegio Sur')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Crear partido y publicar' })).toBeDisabled()
  await expect(page.getByText('Para publicar falta: al menos un convocado.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Guardar borrador', exact: true })).toBeEnabled()

  // Convocar: aparecen los jugadores del equipo elegido
  await page.getByRole('button', { name: 'Convocar jugadores' }).click()
  await expect(page.getByText('Luis Pérez')).toBeVisible()
  await page.getByRole('checkbox', { name: /Ana López/ }).check()
  await expect(page.getByText('Convocatoria · 1 de 2')).toBeVisible()

  await convocar(page)
  await page.getByRole('button', { name: 'Crear partido y publicar' }).click()
  await expect(page.getByRole('heading', { name: 'Sub-15 Masculino vs Colegio Sur' })).toBeVisible()
  await expect(page.getByText('Partido publicado. Se avisó en la App a los padres de 1 convocado.')).toBeVisible()

  const post = api.calls.find((c) => c.method === 'POST' && c.path.endsWith('/events'))!
  expect(post.body).not.toHaveProperty('title')
  expect(post.body).not.toHaveProperty('home_away')
  expect(post.body).not.toHaveProperty('ends_at')
  // Crea y convoca en una sola llamada, publicado
  expect(post.body).toMatchObject({ publish: true, callups: [{ player_id: 15, status: 'called' }] })
  expect(post.headers['idempotency-key']).toBeTruthy()
  expect(api.calls.some((c) => c.method === 'PUT' && c.path.endsWith('/callups'))).toBe(false)
})

test('Ficha: cada gol del rival se le suma como gol en contra al portero (solo al portero)', async ({ page }) => {
  const api = mockApi(page)
  await page.goto('/colegio-demo/login')
  await page.getByLabel('Correo electrónico').fill('coach@demo.gt')
  await page.getByLabel('Contraseña', { exact: true }).fill('Secreta12345')
  await page.getByRole('button', { name: 'Ingresar' }).click()
  await expect(page.getByRole('heading', { name: /Hola/ })).toBeVisible()
  const id = await page.evaluate(async () => {
    const d = new Date(Date.now() - 6 * 3600e3 - 864e5).toISOString().slice(0, 10)
    const r = await fetch('/api/pc/orgs/colegio-demo/events', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ team_id: 1, type: 'match', starts_at: `${d} 10:00`, opponent_name: 'Liceo Norte', publish: true,
        callups: [{ player_id: 15, status: 'called' }, { player_id: 18, status: 'called' }] }) })
    return (await r.json()).data.id
  })
  await page.goto(`/colegio-demo/eventos/${id}?tab=ficha`)

  // Solo el portero (Luis Pérez) tiene "Gol en contra"
  await expect(page.getByRole('button', { name: 'Agregar Gol en contra a Luis Pérez' }).first()).toBeAttached()
  await expect(page.getByRole('button', { name: 'Agregar Gol en contra a Ana López' })).toHaveCount(0)

  await page.getByRole('button', { name: 'Sumar a Liceo Norte' }).click()
  await page.getByRole('button', { name: 'Sumar a Liceo Norte' }).click()
  await page.getByRole('button', { name: 'Restar a Liceo Norte' }).click()
  await page.getByRole('button', { name: 'Agregar Gol a Ana López' }).first().click()
  await expect(page.getByRole('status', { name: 'Marcador de Nosotros' })).toHaveText('1')

  await page.getByRole('button', { name: 'Publicar resultado' }).click()
  await page.getByRole('button', { name: 'Publicar', exact: true }).click()
  await expect(page.getByText('Resultado publicado. Se avisó a los padres.')).toBeVisible()
  const sheet = api.calls.filter((c) => c.path.endsWith('/match-sheet')).at(-1)!
  expect(sheet.body.score_us).toBe(1)
  expect(sheet.body.score_them).toBe(1)
  expect(sheet.body.actions).toEqual([
    { stat_code: 'goal_conceded', player_id: 18, value: 1 },
    { stat_code: 'goal', player_id: 15, value: 1 },
  ])
})

test('Ficha: si empatan, «Se fueron a penales» abre la sección de penales aparte', async ({ page }) => {
  const api = mockApi(page)
  await page.goto('/colegio-demo/login')
  await page.getByLabel('Correo electrónico').fill('coach@demo.gt')
  await page.getByLabel('Contraseña', { exact: true }).fill('Secreta12345')
  await page.getByRole('button', { name: 'Ingresar' }).click()
  await expect(page.getByRole('heading', { name: /Hola/ })).toBeVisible()
  const id = await page.evaluate(async () => {
    const d = new Date(Date.now() - 6 * 3600e3 - 864e5).toISOString().slice(0, 10)
    const r = await fetch('/api/pc/orgs/colegio-demo/events', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ team_id: 1, type: 'match', starts_at: `${d} 10:00`, opponent_name: 'Liceo Norte', publish: true,
        callups: [{ player_id: 15, status: 'called' }, { player_id: 18, status: 'called' }] }) })
    return (await r.json()).data.id
  })
  await page.goto(`/colegio-demo/eventos/${id}?tab=ficha`)

  // 0–0 es empate: aparece el botón
  const penales = page.getByRole('button', { name: 'Se fueron a penales' })
  await expect(penales).toBeVisible()
  await page.getByRole('button', { name: 'Agregar Gol a Ana López' }).first().click()
  await expect(penales).toHaveCount(0)
  await page.getByRole('button', { name: 'Sumar a Liceo Norte', exact: true }).click()
  await penales.click()

  const seccion = page.getByRole('region', { name: 'Penales' })
  await seccion.getByRole('button', { name: 'Agregar Anotó a Ana López' }).click()
  await seccion.getByRole('button', { name: 'Agregar Anotó a Luis Pérez' }).click()
  await seccion.getByRole('button', { name: 'Agregar Falló a Luis Pérez' }).click()
  await seccion.getByRole('button', { name: 'Sumar a Penales de Liceo Norte' }).click()
  await expect(seccion.getByRole('status', { name: 'Penales de Nosotros' })).toHaveText('2')

  // Si se rompe el empate, se avisa que no se guardarán
  await page.getByRole('button', { name: 'Sumar a Liceo Norte', exact: true }).click()
  await expect(seccion.getByText('El marcador ya no está empatado')).toBeVisible()
  await page.getByRole('button', { name: 'Restar a Liceo Norte', exact: true }).click()

  await page.getByRole('button', { name: 'Publicar resultado' }).click()
  await expect(page.getByRole('dialog').getByText('Penales: 2–1')).toBeVisible()
  await page.getByRole('button', { name: 'Publicar', exact: true }).click()
  await expect(page.getByText('Resultado publicado. Se avisó a los padres.')).toBeVisible()
  const sheet = api.calls.filter((c) => c.path.endsWith('/match-sheet')).at(-1)!
  expect(sheet.body).toMatchObject({ score_us: 1, score_them: 1, shootout: { score_us: 2, score_them: 1,
    kicks: [{ player_id: 15, scored: true }, { player_id: 18, scored: true }, { player_id: 18, scored: false }] } })

  // Al volver, los penales siguen ahí
  await page.reload()
  await expect(page.getByRole('region', { name: 'Penales' }).getByRole('status', { name: 'Penales de Nosotros' })).toHaveText('2')
  // El marcador muestra los penales en el partido y en la lista
  await expect(page.getByRole('img', { name: 'Marcador 1 a 1, penales 2 a 1' })).toBeVisible()
  await expect(page.getByText('2–1 pen.')).toBeVisible()
  await page.goto('/colegio-demo/partidos?ver=anteriores')
  await expect(page.getByRole('img', { name: 'Marcador 1 a 1, penales 2 a 1' })).toBeVisible()
})
