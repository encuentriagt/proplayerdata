import { expect, test, type Page } from '@playwright/test'
import { mockApi } from './mockApi'
import { elegirHora, fechaHora } from './helpers'

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
// "Mañana" en hora de Guatemala (UTC−6), igual que la PC
const manana = () => new Date(Date.now() - 6 * 3600e3 + 864e5).toISOString().slice(0, 10)

test('Borrador: se guarda sin publicar, se ve gris con "No publicado", se edita y se publica', async ({ page }) => {
  const api = mockApi(page)
  await entrar(page)
  await page.goto('/colegio-demo/eventos/nuevo?tipo=match')
  await fechaHora(page, manana(), '10:00')
  await page.getByLabel('Rival').fill('Colegio Sur')
  await page.getByRole('button', { name: 'Convocar jugadores' }).click()
  await page.getByRole('checkbox', { name: /Ana López/ }).check()
  await page.getByRole('button', { name: 'Guardar borrador', exact: true }).click()

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
  await fechaHora(page, manana(), '10:00')
  await page.getByLabel('Rival').fill('Liceo Norte')
  await page.getByRole('button', { name: 'Guardar borrador', exact: true }).click()
  // Sin convocados no se puede publicar
  await expect(page.getByRole('button', { name: 'Publicar', exact: true })).toBeDisabled()
  await expect(page.getByText('Para publicar falta: al menos un convocado.')).toBeVisible()
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

test('Tarjetas sin menú ⋮; un partido publicado se cancela antes de borrarlo', async ({ page }) => {
  const api = mockApi(page)
  await entrar(page)
  await page.goto('/colegio-demo/eventos/nuevo?tipo=match')
  await fechaHora(page, manana(), '10:00')
  await page.getByLabel('Rival').fill('Instituto Este')
  await convocar(page)
  await page.getByRole('button', { name: 'Crear partido y publicar' }).click()
  await page.goto('/colegio-demo/partidos')
  await expect(page.getByRole('button', { name: /Opciones de/ })).toHaveCount(0)

  await page.getByRole('link', { name: /Sub-15 Masculino vs Instituto Este/ }).click()
  await expect(page.getByRole('link', { name: 'Editar' })).toBeVisible()
  // Publicado: no se borra directo; primero se cancela (avisa a los padres)
  await expect(page.getByRole('button', { name: 'Borrar' })).toHaveCount(0)
  await expect(page.getByText('Para borrarlo, primero cancele la actividad (se avisará a los padres).')).toBeVisible()
  await page.getByRole('button', { name: 'Cancelar actividad' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Sí, cancelar' }).click()
  expect(api.calls.find((c) => c.method === 'PATCH' && /\/events\/\d+$/.test(c.path))?.body).toEqual({ status: 'cancelled' })
  // Cancelado: ya se puede borrar
  await page.getByRole('button', { name: 'Borrar' }).click()
  await expect(page.getByText('Ya se avisó a los padres que se canceló.')).toBeVisible()
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
  for (const [rival, boton] of [['Colegio Sur', 'Crear partido y publicar'], ['Liceo Norte', 'Guardar borrador']] as const) {
    await page.goto('/colegio-demo/eventos/nuevo?tipo=match')
    await fechaHora(page, manana(), '10:00')
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

test('Asistencia: A · NA · L · NJ · LT; al elegir queda un solo botón con el nombre y al tocarlo se quita', async ({ page }) => {
  const api = mockApi(page)
  await entrar(page)
  await page.goto('/colegio-demo/eventos/nuevo?tipo=match')
  await fechaHora(page, manana(), '10:00')
  await page.getByLabel('Rival').fill('Colegio Sur')
  await convocar(page)
  await convocar(page, 'Luis Pérez')
  await page.getByRole('button', { name: 'Crear partido y publicar' }).click()
  await page.getByRole('tab', { name: 'Asistencia' }).click()

  const ana = page.getByRole('group', { name: 'Asistencia de Ana López' })
  await expect(ana.getByRole('button')).toHaveText(['A', 'NA', 'L', 'NJ', 'LT'])

  // Elegir Asiste: queda un solo botón "Asiste"
  await ana.getByRole('button', { name: 'Asiste', exact: true }).click()
  await expect(ana.getByRole('button')).toHaveText(['Asiste'])
  await expect(page.getByText('1 Asiste')).toBeVisible()
  // Tocarlo de nuevo: se quita y vuelven los 4
  await ana.getByRole('button', { name: /Asiste \(tocar para quitar\)/ }).click()
  await expect(ana.getByRole('button')).toHaveText(['A', 'NA', 'L', 'NJ', 'LT'])
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

test('Un borrador se borra directo (nadie lo ha visto)', async ({ page }) => {
  const api = mockApi(page)
  await entrar(page)
  await page.goto('/colegio-demo/eventos/nuevo?tipo=match')
  await fechaHora(page, manana(), '10:00')
  await page.getByLabel('Rival').fill('Colegio Sur')
  await page.getByRole('button', { name: 'Guardar borrador', exact: true }).click()
  await expect(page.getByText('Para borrarlo, primero cancele')).toHaveCount(0)
  await page.getByRole('button', { name: 'Borrar' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Borrar' }).click()
  await expect(page.getByRole('heading', { name: 'Calendario' })).toBeVisible()
  expect(api.calls.some((c) => c.method === 'PATCH')).toBe(false)
  expect(api.calls.some((c) => c.method === 'DELETE' && /\/events\/\d+$/.test(c.path))).toBe(true)
})

test('Nuevo entreno: sin hora de fin; fecha con calendario propio y hora', async ({ page }) => {
  const api = mockApi(page)
  await entrar(page)
  await page.goto('/colegio-demo/eventos/nuevo?tipo=training')
  await expect(page.getByLabel('Hora de fin (opcional)')).toHaveCount(0)
  await expect(page.getByText('Las horas son de Guatemala.')).toHaveCount(0)
  await expect(page.getByLabel('Fecha', { exact: true })).toContainText('Elija la fecha')
  await page.getByLabel('Fecha', { exact: true }).click()
  await page.getByRole('dialog', { name: /Elegir fecha/ }).getByRole('button', { name: 'Mañana' }).click()
  await elegirHora(page, 'Hora', '15:30')
  await expect(page.getByLabel('Hora', { exact: true })).toHaveText('3:30 p. m.')
  // Hace falta al menos un convocado para crear el entreno
  await expect(page.getByRole('button', { name: 'Crear entreno' })).toBeDisabled()
  await expect(page.getByText('Para crear el entreno falta: al menos un convocado.')).toBeVisible()
  await convocar(page)
  await expect(page.getByText('Para crear el entreno falta')).toHaveCount(0)
  await page.getByRole('button', { name: 'Crear entreno' }).click()
  // Confirmación con el aviso que recibirán los padres (sin nombres de jugadores)
  const dlg = page.getByRole('dialog')
  await expect(dlg.getByText('¿Crear el entreno y avisar?')).toBeVisible()
  await expect(dlg.getByText(/Se programó un entreno de Sub-15 Masculino: .*, 3:30 p\. m\./)).toBeVisible()
  await expect(dlg.getByText(/Ana López/)).toHaveCount(0)
  await dlg.getByRole('button', { name: 'Crear y avisar' }).click()
  await expect(page.getByRole('heading', { name: 'Entrenamiento' })).toBeVisible()
  const post = api.calls.find((c) => c.method === 'POST' && c.path.endsWith('/events'))!
  expect(post.body.starts_at).toBe(`${manana()} 15:30`)
  expect(post.body.notify).toBe(true)
  expect(post.body).not.toHaveProperty('ends_at')
  expect(post.body).toMatchObject({ type: 'training', publish: true, callups: [{ player_id: 15, status: 'called' }] })
})

test('Entreno recurrente: lunes y miércoles por 1 mes, con vista previa', async ({ page }) => {
  const api = mockApi(page)
  await entrar(page)
  await page.goto('/colegio-demo/eventos/nuevo?tipo=training')
  await fechaHora(page, '2026-12-02', '15:30') // miércoles
  await page.getByLabel('Lugar').fill('Gimnasio')
  await page.getByRole('checkbox', { name: 'Se repite' }).check()
  // Por defecto, el día de la fecha elegida (miércoles) y "1 mes"; no hay "Fin de temporada"
  await expect(page.getByRole('button', { name: 'miércoles' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('button', { name: '1 mes' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('button', { name: /Fin de temporada/ })).toHaveCount(0)
  await page.getByRole('button', { name: 'lunes' }).click()
  // 2 dic → 2 ene: mié 2, 9, 16, 23, 30 y lun 7, 14, 21, 28 = 9
  await expect(page.getByText(/Se crearán 9 entrenos, cada lunes y miércoles, del Miércoles 2 de diciembre al Miércoles 30 de diciembre/)).toBeVisible()
  await page.getByRole('button', { name: 'Ver fechas' }).click()
  await expect(page.getByText(/mié 2 dic · lun 7 dic/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Crear 9 entrenos' })).toBeDisabled()
  await convocar(page)
  await convocar(page, 'Luis Pérez')
  await expect(page.getByText('Los convocados aplican a todos los entrenos de la serie.')).toBeVisible()
  await page.getByRole('button', { name: 'Crear 9 entrenos' }).click()
  const dlg = page.getByRole('dialog')
  await expect(dlg.getByText('Se enviará este aviso a la App de los padres o encargados de los 2 convocados')).toBeVisible()
  await expect(dlg.getByText('«Se programaron 9 entrenos de Sub-15 Masculino: lunes y miércoles, 3:30 p. m., del 2 de diciembre al 30 de diciembre.»')).toBeVisible()
  // Cancelar no crea nada
  await dlg.getByRole('button', { name: 'Cancelar' }).click()
  expect(api.calls.some((c) => c.method === 'POST' && c.path.endsWith('/events/series'))).toBe(false)
  await page.getByRole('button', { name: 'Crear 9 entrenos' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Crear 9 y avisar' }).click()
  await expect(page.getByText('Se crearon 9 entrenos.')).toBeVisible()
  const post = api.calls.find((c) => c.method === 'POST' && c.path.endsWith('/events/series'))!
  expect(post.body).toMatchObject({ team_id: 1, type: 'training', from: '2026-12-02', until: '2027-01-02', weekdays: [1, 3], time: '15:30', location: 'Gimnasio', notify: true,
    callups: [{ player_id: 15, status: 'called' }, { player_id: 18, status: 'called' }] })
  expect(post.headers['idempotency-key']).toBeTruthy()
})

test('Entreno recurrente: sin días no se puede crear', async ({ page }) => {
  mockApi(page)
  await entrar(page)
  await page.goto('/colegio-demo/eventos/nuevo?tipo=training')
  await fechaHora(page, '2026-12-02', '15:30')
  await page.getByRole('checkbox', { name: 'Se repite' }).check()
  await page.getByRole('button', { name: 'miércoles' }).click()
  await expect(page.getByText('Elija al menos un día.')).toBeVisible()
  await expect(page.getByRole('button', { name: /^Crear .*entrenos$/ })).toBeDisabled()
})
test('Reloj de hora: primero la hora, luego pasa solo a minutos; Cancelar no cambia nada', async ({ page }) => {
  mockApi(page)
  await entrar(page)
  await page.goto('/colegio-demo/eventos/nuevo?tipo=match')
  await page.getByLabel('Hora', { exact: true }).click()
  const reloj = page.getByRole('dialog', { name: /Elegir hora/ })
  await expect(reloj.getByText('Elija la hora')).toBeVisible()
  await expect(reloj.getByRole('button', { name: 'Aceptar' })).toBeDisabled()
  await reloj.getByRole('button', { name: '7 horas', exact: true }).click()
  await expect(reloj.getByText('Elija los minutos')).toBeVisible()
  await reloj.getByRole('button', { name: '45 minutos', exact: true }).click()
  await reloj.getByRole('button', { name: 'Cancelar' }).click()
  await expect(page.getByLabel('Hora', { exact: true })).toHaveText('Elija la hora')
  await elegirHora(page, 'Hora', '07:45')
  await expect(page.getByLabel('Hora', { exact: true })).toHaveText('7:45 a. m.')
})

test('Guardar borrador: basta equipo y fecha; la hora queda "por definir"', async ({ page }) => {
  const api = mockApi(page)
  await entrar(page)
  await page.goto('/colegio-demo/eventos/nuevo?tipo=match')
  const borrador = page.getByRole('button', { name: 'Guardar borrador', exact: true })
  await expect(borrador).toBeDisabled()
  await expect(page.getByText('Para guardar el borrador falta: fecha.')).toBeVisible()
  await page.getByLabel('Fecha', { exact: true }).click()
  await page.getByRole('dialog', { name: /Elegir fecha/ }).getByRole('button', { name: 'Mañana' }).click()
  await expect(borrador).toBeEnabled()
  await expect(page.getByText('Para guardar el borrador falta')).toHaveCount(0)
  await expect(page.getByText('Para publicar falta: hora, rival y al menos un convocado.')).toBeVisible()
  await borrador.click()
  await expect(page.getByText('Borrador guardado. No se avisó a nadie')).toBeVisible()
  const post = api.calls.find((c) => c.method === 'POST' && c.path.endsWith('/events'))!
  expect(post.body).toMatchObject({ team_id: 1, publish: false, starts_at: manana(), time_pending: true })
  expect(post.body).not.toHaveProperty('callups')
  await expect(page.getByText(/· Hora por definir/)).toBeVisible()
  await expect(page.getByText('Para publicar falta: hora, rival, al menos un convocado.')).toBeVisible()

  // En Partidos: la tarjeta dice "Hora por definir"
  await page.goto('/colegio-demo/partidos')
  await expect(page.getByText('Hora por definir')).toBeVisible()

  // Al editar, la hora sigue vacía y se puede poner
  await page.getByRole('link', { name: /Sub-15 Masculino · Partido/ }).click()
  await page.getByRole('link', { name: 'Editar' }).click()
  await expect(page.getByLabel('Hora', { exact: true })).toHaveText('Elija la hora')
  await elegirHora(page, 'Hora', '16:00')
  await page.getByRole('button', { name: 'Guardar borrador', exact: true }).click()
  const patch = api.calls.filter((c) => c.method === 'PATCH').at(-1)!
  expect(patch.body).toMatchObject({ starts_at: `${manana()} 16:00`, time_pending: false })
})

test('Entreno recurrente: la serie debe empezar hoy o después (regla de la API)', async ({ page }) => {
  mockApi(page)
  await entrar(page)
  await page.goto('/colegio-demo/eventos/nuevo?tipo=training')
  const ayer = new Date(Date.now() - 6 * 3600e3 - 864e5).toISOString().slice(0, 10)
  await fechaHora(page, ayer, '15:30')
  await convocar(page)
  await page.getByRole('checkbox', { name: 'Se repite' }).check()
  await expect(page.getByText('La serie debe empezar hoy o después.')).toBeVisible()
  await expect(page.getByRole('button', { name: /^Crear .*entrenos$/ })).toBeDisabled()
})

test('Asistencia: Llegó tarde (LT) se guarda como late y se cuenta aparte', async ({ page }) => {
  const api = mockApi(page)
  await entrar(page)
  await page.goto('/colegio-demo/eventos/nuevo?tipo=match')
  await fechaHora(page, manana(), '10:00')
  await page.getByLabel('Rival').fill('Colegio Sur')
  await convocar(page)
  await convocar(page, 'Luis Pérez')
  await page.getByRole('button', { name: 'Crear partido y publicar' }).click()
  await page.getByRole('tab', { name: 'Asistencia' }).click()

  const ana = page.getByRole('group', { name: 'Asistencia de Ana López' })
  await ana.getByRole('button', { name: 'Llegó tarde', exact: true }).click()
  await expect(ana.getByRole('button')).toHaveText(['Llegó tarde'])
  await page.getByRole('group', { name: 'Asistencia de Luis Pérez' }).getByRole('button', { name: 'Asiste', exact: true }).click()
  await expect(page.getByText('1 Llegó tarde')).toBeVisible()
  await expect(page.getByText('1 Asiste')).toBeVisible()
  await expect(page.getByText('LT = llegó tarde')).toBeVisible()

  await page.getByRole('button', { name: 'Guardar y publicar asistencia' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Enviar' }).click()
  await expect(page.getByText('Asistencia guardada y publicada. Los padres ya la ven en la App.')).toBeVisible()
  expect(api.calls.filter((c) => c.method === 'PUT' && c.path.endsWith('/attendance')).at(-1)?.body.records).toEqual([
    { player_id: 15, status: 'late' }, { player_id: 18, status: 'present' },
  ])

  // Al volver a entrar, el registro guardado sigue como Llegó tarde
  await page.reload()
  await page.getByRole('tab', { name: 'Asistencia' }).click()
  await expect(page.getByRole('group', { name: 'Asistencia de Ana López' }).getByRole('button')).toHaveText(['Llegó tarde'])
})
