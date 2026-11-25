import { expect, test, type Page } from '@playwright/test'
import { mockApi } from './mockApi'

/** Para publicar hace falta al menos un convocado (regla del dueño). */
async function convocar(page: Page, nombre = 'Ana López') {
  const btn = page.getByRole('button', { name: 'Convocar jugadores' })
  if (await btn.isVisible()) await btn.click()
  await page.getByRole('checkbox', { name: new RegExp(nombre) }).check()
}

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
  await page.getByRole('link', { name: /Sub-15 Masculino vs Colegio Sur/ }).click()
  await page.getByRole('link', { name: 'Editar' }).click()
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
  // Sin convocados no se puede publicar
  await expect(page.getByRole('button', { name: 'Publicar', exact: true })).toBeDisabled()
  await expect(page.getByText('Convoque al menos a un jugador para publicar.')).toBeVisible()
  await page.getByRole('tab', { name: 'Convocatoria' }).click()
  await page.getByRole('group', { name: 'Convocatoria de Ana López' }).getByRole('button', { name: 'Convocado' }).click()
  await page.getByRole('button', { name: 'Guarde la convocatoria' }).click()
  await expect(page.getByText(/Convocatoria guardada/)).toBeVisible()
  await page.getByRole('button', { name: 'Publicar', exact: true }).click()
  await expect(page.getByText('¿Publicar este partido?')).toBeVisible()
  await page.getByRole('dialog').getByRole('button', { name: 'Publicar' }).click()
  await expect(page.getByText('Es un borrador: los padres no lo ven')).toHaveCount(0)
  expect(api.calls.some((c) => c.method === 'POST' && c.path.endsWith('/publish'))).toBe(true)
})

test('Tarjetas de Partidos sin menú ⋮; editar y borrar desde el detalle', async ({ page }) => {
  const api = mockApi(page)
  await entrar(page)
  await page.goto('/colegio-demo/eventos/nuevo?tipo=match')
  await page.getByLabel('Fecha y hora').fill(`${manana()}T10:00`)
  await page.getByLabel('Rival').fill('Instituto Este')
  await convocar(page)
  await page.getByRole('button', { name: 'Crear partido y publicar' }).click()
  await page.goto('/colegio-demo/partidos')
  await expect(page.getByRole('button', { name: /Opciones de/ })).toHaveCount(0)

  await page.getByRole('link', { name: /Sub-15 Masculino vs Instituto Este/ }).click()
  await expect(page.getByRole('link', { name: 'Editar' })).toBeVisible()
  await page.getByRole('button', { name: 'Borrar' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Borrar' }).click()
  await expect(page.getByRole('heading', { name: 'Calendario' })).toBeVisible()
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

test('Un partido guardado (publicado o borrador) aparece en Partidos, no solo en Inicio', async ({ page }) => {
  mockApi(page)
  await entrar(page)
  for (const [rival, boton] of [['Colegio Sur', 'Crear partido y publicar'], ['Liceo Norte', 'Borrador']] as const) {
    await page.goto('/colegio-demo/eventos/nuevo?tipo=match')
    await page.getByLabel('Fecha y hora').fill(`${manana()}T10:00`)
    await page.getByLabel('Rival').fill(rival)
    if (boton === 'Crear partido y publicar') await convocar(page)
    await page.getByRole('button', { name: boton, exact: true }).click()
    await expect(page.getByRole('heading', { name: `Sub-15 Masculino vs ${rival}` })).toBeVisible()
  }
  await page.goto('/colegio-demo')
  await expect(page.getByText('Sub-15 Masculino vs Colegio Sur')).toBeVisible()
  await page.goto('/colegio-demo/partidos')
  // La API rechaza rangos de más de 120 días: la lista debe pedir un rango válido y mostrar ambos
  await expect(page.getByText('El rango máximo es de 120 días.')).toHaveCount(0)
  await expect(page.getByText('Sub-15 Masculino vs Colegio Sur')).toBeVisible()
  await expect(page.getByText('Sub-15 Masculino vs Liceo Norte')).toBeVisible()
  // Anteriores también con rangos válidos, incluso al cargar más
  await page.getByRole('tab', { name: 'Anteriores' }).click()
  await page.getByRole('button', { name: 'Ver más antiguos' }).click()
  await expect(page.getByText('El rango máximo es de 120 días.')).toHaveCount(0)
})

test('Asistencia: A · NA · L · NJ; al elegir queda un solo botón con el nombre y al tocarlo se quita', async ({ page }) => {
  const api = mockApi(page)
  await entrar(page)
  await page.goto('/colegio-demo/eventos/nuevo?tipo=match')
  await page.getByLabel('Fecha y hora').fill(`${manana()}T10:00`)
  await page.getByLabel('Rival').fill('Colegio Sur')
  await convocar(page)
  await convocar(page, 'Luis Pérez')
  await page.getByRole('button', { name: 'Crear partido y publicar' }).click()
  await page.getByRole('tab', { name: 'Asistencia' }).click()

  const ana = page.getByRole('group', { name: 'Asistencia de Ana López' })
  await expect(ana.getByRole('button')).toHaveText(['A', 'NA', 'L', 'NJ'])

  // Elegir Asiste: queda un solo botón "Asiste"
  await ana.getByRole('button', { name: 'Asiste', exact: true }).click()
  await expect(ana.getByRole('button')).toHaveText(['Asiste'])
  await expect(page.getByText('1 Asiste')).toBeVisible()
  // Tocarlo de nuevo: se quita y vuelven los 4
  await ana.getByRole('button', { name: /Asiste \(tocar para quitar\)/ }).click()
  await expect(ana.getByRole('button')).toHaveText(['A', 'NA', 'L', 'NJ'])
  await expect(page.getByText('0 Asiste')).toBeVisible()

  await ana.getByRole('button', { name: 'Lesión' }).click()
  await expect(ana.getByRole('button')).toHaveText(['Lesión'])
  await page.getByRole('group', { name: 'Asistencia de Luis Pérez' }).getByRole('button', { name: 'No justificado' }).click()
  await expect(page.getByText('1 Lesión')).toBeVisible()
  await expect(page.getByText('1 No justificado')).toBeVisible()
  // Confirmación antes de enviar: cancelar no envía nada
  await page.getByRole('button', { name: 'Guardar y publicar asistencia' }).click()
  await expect(page.getByText('¿Enviar la asistencia?')).toBeVisible()
  await expect(page.getByText(/aviso a la App de los padres o encargados de cada jugador marcado \(2 jugadores\)/)).toBeVisible()
  await page.getByRole('dialog').getByRole('button', { name: 'Cancelar' }).click()
  expect(api.calls.some((c) => c.method === 'PUT' && c.path.endsWith('/attendance'))).toBe(false)
  await page.getByRole('button', { name: 'Guardar y publicar asistencia' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Enviar' }).click()
  await expect(page.getByText('Asistencia guardada y publicada. Los padres ya la ven en la App.')).toBeVisible()
  expect(api.calls.filter((c) => c.method === 'PUT' && c.path.endsWith('/attendance')).at(-1)?.body.records).toEqual([
    { player_id: 15, status: 'injured' }, { player_id: 18, status: 'absent' },
  ])

  // Quitar una marca ya guardada: se envía status null para borrar ese registro
  await page.getByRole('group', { name: 'Asistencia de Luis Pérez' }).getByRole('button', { name: /No justificado \(tocar para quitar\)/ }).click()
  await page.getByRole('button', { name: 'Guardar y publicar asistencia' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Enviar' }).click()
  await expect(page.getByText('Asistencia guardada y publicada. Los padres ya la ven en la App.')).toBeVisible()
  expect(api.calls.filter((c) => c.method === 'PUT' && c.path.endsWith('/attendance')).at(-1)?.body.records).toEqual([
    { player_id: 15, status: 'injured' }, { player_id: 18, status: null },
  ])
})
