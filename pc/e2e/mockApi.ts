import type { Page, Route } from '@playwright/test'

/** API simulada en memoria con las mismas formas que api.ppdguate.com (docs/API.md). */
type MockRole = 'coach' | 'director' | 'org_admin'

const PERMS = {
  coach: { invite_roles: ['guardian'], manage_members: false, manage_directors: false, manage_seasons: false, manage_plans: false, manage_branding: false, manage_sports: false, manage_positions: [1], create_teams: [], delete_players: false, create_players_without_team: false, director_scope: null },
  director: { invite_roles: ['coach', 'guardian'], manage_members: true, manage_directors: false, manage_seasons: false, manage_plans: false, manage_branding: false, manage_sports: false, manage_positions: [1], create_teams: [1], delete_players: false, create_players_without_team: false, director_scope: { sport_ids: [1], team_ids: [] } },
  org_admin: { invite_roles: ['org_admin', 'director', 'coach', 'guardian'], manage_members: true, manage_directors: true, manage_seasons: true, manage_plans: true, manage_branding: true, manage_sports: true, manage_positions: [1, 2], create_teams: 'all', delete_players: true, create_players_without_team: true, director_scope: null },
} as const
const LABEL = { coach: 'Coach', director: 'Director técnico', org_admin: 'Administrador' } as const

export function mockApi(page: Page, role: MockRole = 'coach') {
  const org = {
    name: 'Colegio Demo ppd', slug: 'colegio-demo', type: 'school', active: true,
    logo_url: null, crest_url: null, cover_url: null,
    colors: { primary: '#0B3D91', secondary: '#F2B705', on_primary: '#FFFFFF' }, powered_by: 'ppd',
  }
  const user = { id: 1, name: role === 'coach' ? 'Carlos Coach' : role === 'director' ? 'Diana Directora' : 'Ana Admin', email: 'coach@demo.gt', must_change_password: false, is_super_admin: false }
  const session = { user, memberships: [{ organization_id: 1, role, role_label: LABEL[role], branding_editable: role === 'org_admin', permissions: PERMS[role], organization: org }], is_guardian: false }
  const sport = {
    id: 1, code: 'soccer', name: 'Soccer', periods: 2, period_minutes: 40, max_on_field: 11, unlimited_substitutions: false,
    positions: [{ id: 1, code: 'POR', name: 'Portero', sort: 1 }, { id: 3, code: 'DEL', name: 'Delantero', sort: 2 }] as any[],
    stat_types: [{ id: 1, code: 'goal', name: 'Gol', scores: 1 }, { id: 2, code: 'assist', name: 'Asistencia', scores: 0 }, { id: 3, code: 'yellow_card', name: 'Amarilla', scores: 0 }],
  }
  const team = { id: 1, name: 'Sub-15 Masculino', category: 'Sub-15', gender: 'male', color: '#0B3D91', sport: { id: 1, code: 'soccer', name: 'Soccer' }, season: null }
  const basketSport = { id: 2, code: 'basketball', name: 'Basketball', periods: 4, period_minutes: 10, max_on_field: 5, unlimited_substitutions: true, positions: [], stat_types: [{ id: 9, code: 'point_2', name: 'Doble', scores: 2 }] }
  const basket = { id: 2, name: 'Básquet Juvenil', category: 'Juvenil', gender: 'mixed', color: '#F2B705', sport: { id: 2, code: 'basketball', name: 'Basketball' }, season: null }
  const volleySport = { id: 3, code: 'volleyball', name: 'Volleyball', periods: 5, period_minutes: null, max_on_field: 6, unlimited_substitutions: true, positions: [], stat_types: [{ id: 20, code: 'point', name: 'Punto', scores: 1 }] }
  // Deportes activados por la organización (GET/PUT sports). Soccer y Basketball tienen equipos.
  let enabled = [1, 2]
  const visibleSports = () => [sport, basketSport, volleySport].filter((x) => enabled.includes(x.id) && (role === 'org_admin' || x.id === 1))
  let scope: any = { sports: [{ id: 1, code: 'soccer', name: 'Soccer' }], teams: [] }
  const roster = [
    { id: 15, first_name: 'Ana', last_name: 'López', full_name: 'Ana López', birthdate: '2011-03-02', gender: 'female', photo_url: null, jersey_number: 9, position: { id: 3, code: 'DEL', name: 'Delantero' }, active: true },
    { id: 18, first_name: 'Luis', last_name: 'Pérez', full_name: 'Luis Pérez', birthdate: '2011-06-10', gender: 'male', photo_url: null, jersey_number: 1, position: { id: 1, code: 'POR', name: 'Portero' }, active: true },
  ]
  const events: Record<number, any> = {}
  let nextId = 100
  const calls: { method: string; path: string; query: URLSearchParams; body: any; headers: Record<string, string> }[] = []

  const ok = (route: Route, data: unknown, status = 200, meta?: unknown) =>
    route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(meta ? { data, meta } : { data }) })

  page.route('**/api/**', async (route) => {
    const req = route.request()
    const url = new URL(req.url())
    const path = url.pathname.replace(/^\/api\//, '')
    const method = req.method()
    const body = req.postData() ? JSON.parse(req.postData()!) : null
    calls.push({ method, path, query: url.searchParams, body, headers: req.headers() })
    const pc = path.replace(/^pc\/orgs\/colegio-demo\//, '')

    if (path === 'public/orgs/colegio-demo/branding') return ok(route, org)
    if (path === 'auth/login' && method === 'POST') {
      if (req.headers()['x-app-platform'] !== 'web') return ok(route, { error: { code: 'platform_invalid' } }, 422)
      if (body.password !== 'Secreta12345') {
        return route.fulfill({ status: 422, contentType: 'application/json', body: JSON.stringify({ error: { code: 'invalid_credentials', message: 'Correo o contraseña incorrectos.' } }) })
      }
      return ok(route, { token: 'tok-123', token_type: 'Bearer', expires_at: null, admin_totp: null, ...session })
    }
    if (path === 'auth/me') return ok(route, session)
    if (path === 'auth/password/forgot') return ok(route, { ok: true, message: 'Si el correo está registrado, recibirá un enlace para crear una nueva contraseña.' })
    if (path === 'auth/password/reset/bueno') return ok(route, { email_masked: 'co***@demo.gt' })
    if (path.startsWith('auth/password/reset/')) {
      return route.fulfill({ status: 410, contentType: 'application/json', body: JSON.stringify({ error: { code: 'reset_invalid', message: 'El enlace no es válido o ya venció. Pida uno nuevo.' } }) })
    }
    if (path === 'auth/password/reset' && method === 'POST') {
      body.password = 'Secreta12345' // a partir de aquí el login acepta la nueva contraseña
      return ok(route, { ok: true, email: user.email })
    }
    if (path === 'auth/logout') return ok(route, { ok: true })
    if (path === 'catalog/sports') return ok(route, [sport, basketSport, volleySport])
    if (pc === 'sports' && method === 'GET') return ok(route, visibleSports())
    const pm = pc.match(/^sports\/(\d+)\/positions$/)
    if (pm && method === 'POST') {
      const s = [sport, basketSport, volleySport].find((x) => x.id === Number(pm[1]))!
      const p = { id: 100 + s.positions.length, code: body.name.slice(0, 3).toUpperCase(), name: body.name, sort: s.positions.length + 1 }
      s.positions.push(p as any)
      return ok(route, p, 201)
    }
    const ps = pc.match(/^positions\/(\d+)$/)
    if (ps) {
      const s = [sport, basketSport, volleySport].find((x) => x.positions.some((p: any) => p.id === Number(ps[1])))!
      const p: any = s.positions.find((x: any) => x.id === Number(ps[1]))
      if (method === 'PATCH') { Object.assign(p, body); return ok(route, p) }
      if (method === 'DELETE') {
        // Delantero (id 3) la tiene Ana López en la plantilla
        if (p.id === 3) return route.fulfill({ status: 422, contentType: 'application/json', body: JSON.stringify({ error: { code: 'position_in_use', message: 'La usan 1 jugador(es) en sus plantillas. Cámbieles la posición primero.', players: 1 } }) })
        s.positions.splice(s.positions.indexOf(p), 1)
        return ok(route, { ok: true })
      }
    }
    if (pc === 'sports' && method === 'PUT') {
      const removed = enabled.filter((x) => !body.sport_ids.includes(x)).filter((x) => x === 1 || x === 2)
      if (removed.length) return route.fulfill({ status: 422, contentType: 'application/json', body: JSON.stringify({ error: { code: 'sport_in_use', message: 'No se puede desactivar un deporte que tiene equipos.', sport_ids: removed } }) })
      enabled = body.sport_ids
      return ok(route, visibleSports())
    }
    if (pc === 'teams' && method === 'GET') return ok(route, role === 'coach' ? [{ ...team, can_manage: false }] : [{ ...team, can_manage: true }, { ...basket, can_manage: role === 'org_admin' }])
    if (pc === 'members' && method === 'GET') {
      if (role === 'coach') return route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ error: { code: 'forbidden', message: 'No tiene permiso.' } }) })
      const coachRow = { id: 2, user_id: 2, name: 'Carlos Coach', email: 'coach@demo.gt', role: 'coach', role_label: 'Coach', status: 'active', last_login_at: null, teams: [{ id: 1, name: team.name, role: 'head_coach' }], director_scope: null }
      const directorRow = { id: 3, user_id: 3, name: 'Diana Directora', email: 'director@demo.gt', role: 'director', role_label: 'Director técnico', status: 'active', last_login_at: null, teams: [], director_scope: scope }
      return ok(route, role === 'org_admin' ? [directorRow, coachRow] : [coachRow])
    }
    const sm = pc.match(/^members\/(\d+)\/scopes$/)
    if (sm && method === 'PUT') {
      scope = { sports: [sport, basketSport].filter((x) => body.sport_ids.includes(x.id)).map(({ id, code, name }) => ({ id, code, name })), teams: [team, basket].filter((t) => body.team_ids.includes(t.id)).map(({ id, name }) => ({ id, name })) }
      return ok(route, { id: Number(sm[1]), director_scope: scope })
    }
    if (pc === 'teams/1') return ok(route, { ...team, sport, staff: [{ user_id: 1, name: 'Carlos Coach', role: 'head_coach' }], can_manage: role !== 'coach' })
    if (pc === 'teams/1/roster') return ok(route, roster)
    if (pc === 'seasons') return ok(route, [{ id: 1, name: '2026-2027', starts_on: '2026-07-01', ends_on: '2027-06-30', is_current: true }])
    if (pc === 'invitations' && method === 'GET') return ok(route, [])
    if (pc === 'events' && method === 'GET') {
      const list = Object.values(events).map(({ sport: _s, callups, attendance, lineup, actions, player_stats, ...e }) => e)
      const q = url.searchParams
      if (q.get('pending_sheet') !== '1') {
        // Igual que la API: filtra por tipo, equipo y rango de fechas (hora de Guatemala).
        const from = q.get('from'), to = q.get('to')
        if (from && to && (Date.parse(`${to}T23:59:59Z`) - Date.parse(`${from}T00:00:00Z`)) / 864e5 > 120) {
          return route.fulfill({ status: 422, contentType: 'application/json', body: JSON.stringify({ error: { code: 'range_too_large', message: 'El rango máximo es de 120 días.' } }) })
        }
        const day = (iso: string) => iso.slice(0, 10)
        const sportOf = (tid: number) => (tid === 2 ? 2 : 1)
        const base = (e: any) => (!q.get('type') || e.type === q.get('type')) && (!q.get('team_id') || String(e.team_id) === q.get('team_id'))
          && (!q.get('sport_id') || String(sportOf(e.team_id)) === q.get('sport_id'))
        return ok(route, list.filter((e: any) => base(e) && !!e.starts_at && (!from || day(e.starts_at) >= from) && (!to || day(e.starts_at) <= to)))
      }
      if (q.get('pending_sheet') === '1') {
        return ok(route, list.filter((e: any) => e.type === 'match' && e.status !== 'cancelled' && !e.result_published_at && !!e.starts_at && new Date(e.starts_at) < new Date()))
      }
      return ok(route, list)
    }
    if (pc === 'events/series' && method === 'POST') {
      // Propuesta al backend: crea toda la serie de una vez
      const iso = (d: Date) => d.toISOString().slice(0, 10)
      let n = 0
      for (let d = new Date(`${body.from}T12:00:00Z`); iso(d) <= body.until; d = new Date(d.getTime() + 864e5)) {
        const wd = ((d.getUTCDay() + 6) % 7) + 1
        if (!body.weekdays.includes(wd)) continue
        const id = nextId++
        events[id] = { id, team_id: body.team_id, team_name: team.name, type: 'training', title: body.title, display_title: body.title ?? 'Entrenamiento',
          starts_at: `${iso(d)}T${body.time}:00-06:00`, ends_at: null, location: body.location, opponent_name: null, home_away: null, status: 'scheduled',
          score_us: null, score_them: null, result_published_at: null, notes: body.notes, is_draft: false, published_at: new Date().toISOString(),
          sport, callups: (body.callups ?? []).map((c: any) => ({ ...c, player_name: null, guardian_response: 'pending', responded_at: null })), attendance: [], lineup: [], actions: [], player_stats: [] }
        n++
      }
      return ok(route, { series_id: 1, count: n }, 201)
    }
    if (pc === 'events' && method === 'POST') {
      const id = nextId++
      const e = {
        id, team_id: body.team_id, team_name: team.name, type: body.type, title: body.title,
        display_title: body.title ?? (body.type === 'match' ? (body.opponent_name ? `${[team, basket].find((t) => t.id === body.team_id)?.name} vs ${body.opponent_name}` : `${[team, basket].find((t) => t.id === body.team_id)?.name} · Partido`) : ({ training: 'Entrenamiento', other: 'Actividad' } as any)[body.type]),
        starts_at: !body.starts_at ? null : body.starts_at.length === 10 ? `${body.starts_at}T00:00:00-06:00` : body.starts_at.replace(' ', 'T') + ':00-06:00',
        time_pending: !!body.time_pending, ends_at: null, location: body.location, opponent_name: body.opponent_name,
        home_away: body.home_away, status: 'scheduled', score_us: null, score_them: null, result_published_at: null, notes: body.notes,
        is_draft: body.publish === false, published_at: body.publish === false ? null : new Date().toISOString(),
        sport, callups: (body.callups ?? []).map((c: any) => ({ player_id: c.player_id, player_name: null, status: c.status ?? 'called', guardian_response: 'pending', responded_at: null })),
        attendance: [], lineup: [], actions: [], player_stats: [],
      }
      events[id] = e
      return ok(route, e, 201)
    }
    const m = pc.match(/^events\/(\d+)(?:\/(callups|attendance|match-sheet|publish))?$/)
    if (m) {
      const e = events[Number(m[1])]
      if (!e) return ok(route, null, 404)
      if (!m[2] && method === 'GET') return ok(route, e)
      if (!m[2] && method === 'DELETE') { delete events[e.id]; return ok(route, { ok: true }) }
      if (!m[2] && method === 'PATCH') {
        Object.assign(e, body)
        if (body.starts_at) e.starts_at = body.starts_at.length === 10 ? `${body.starts_at}T00:00:00-06:00` : body.starts_at.replace(' ', 'T') + ':00-06:00'
        if (body.opponent_name !== undefined && e.type === 'match') e.display_title = body.opponent_name ? `${[team, basket].find((t) => t.id === e.team_id)?.name} vs ${body.opponent_name}` : 'Partido'
        return ok(route, e)
      }
      if (m[2] === 'publish' && !e.starts_at) return route.fulfill({ status: 422, contentType: 'application/json', body: JSON.stringify({ error: { code: 'validation_failed', message: 'Falta la fecha.' } }) })
      if (m[2] === 'publish') { e.is_draft = false; e.published_at ??= new Date().toISOString(); return ok(route, e) }
      if (m[2] === 'callups') {
        const prev = new Set(e.callups.map((c: any) => c.player_id))
        e.callups = body.players.map((p: any) => ({ player_id: p.player_id, player_name: null, status: p.status ?? 'called', guardian_response: 'pending', responded_at: null }))
        return ok(route, { count: e.callups.length, newly_called: body.players.map((p: any) => p.player_id).filter((id: number) => !prev.has(id)) })
      }
      if (m[2] === 'attendance') {
        // status null = quitar el registro (pedido al backend)
        const bad = body.records.find((r: any) => r.status !== null && !['present', 'absent', 'late', 'excused', 'injured'].includes(r.status))
        if (bad) return route.fulfill({ status: 422, contentType: 'application/json', body: JSON.stringify({ error: { code: 'validation_failed', message: 'Estado no válido.' } }) })
        const keep = e.attendance.filter((a: any) => !body.records.some((r: any) => r.player_id === a.player_id))
        e.attendance = [...keep, ...body.records.filter((r: any) => r.status !== null).map((r: any) => ({ ...r, player_name: null, note: r.note ?? null }))]
        return ok(route, { count: body.records.length })
      }
      if (m[2] === 'match-sheet' && e.is_draft) return route.fulfill({ status: 422, contentType: 'application/json', body: JSON.stringify({ error: { code: 'event_draft', message: 'Publique el partido primero.' } }) })
      if (m[2] === 'match-sheet') {
        e.score_us = body.score_us
        e.score_them = body.score_them
        e.lineup = body.lineup
        e.actions = body.actions.map((a: any) => ({ type: 'stat', ...a }))
        if (body.publish) { e.status = 'finished'; e.result_published_at ??= new Date().toISOString() }
        const scored = body.actions.filter((a: any) => a.stat_code === 'goal').reduce((n: number, a: any) => n + (a.value ?? 1), 0)
        const warnings = scored !== body.score_us ? [`La suma de anotaciones de sus jugadores (${scored}) no coincide con el marcador (${body.score_us}).`] : []
        const { sport: _s, callups, attendance, lineup, actions, player_stats, ...payload } = e
        return ok(route, { ...payload, warnings })
      }
    }
    return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: { code: 'not_found', message: `Sin simular: ${method} ${path}` } }) })
  })

  return { calls }
}
