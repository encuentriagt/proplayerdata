import type { Page, Route } from '@playwright/test'

/** API simulada en memoria con las mismas formas que api.ppdguate.com (docs/API.md). */
type MockRole = 'coach' | 'director' | 'org_admin'

const PERMS = {
  coach: { invite_roles: ['guardian'], manage_members: false, manage_directors: false, manage_seasons: false, manage_plans: false, manage_branding: false, create_teams: [], delete_players: false, create_players_without_team: false, director_scope: null },
  director: { invite_roles: ['coach', 'guardian'], manage_members: true, manage_directors: false, manage_seasons: false, manage_plans: false, manage_branding: false, create_teams: [1], delete_players: false, create_players_without_team: false, director_scope: { sport_ids: [1], team_ids: [] } },
  org_admin: { invite_roles: ['org_admin', 'director', 'coach', 'guardian'], manage_members: true, manage_directors: true, manage_seasons: true, manage_plans: true, manage_branding: true, create_teams: 'all', delete_players: true, create_players_without_team: true, director_scope: null },
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
    id: 1, code: 'football', name: 'Fútbol', periods: 2, period_minutes: 40, max_on_field: 11, unlimited_substitutions: false,
    positions: [{ id: 1, code: 'POR', name: 'Portero' }, { id: 3, code: 'DEL', name: 'Delantero' }],
    stat_types: [{ id: 1, code: 'goal', name: 'Gol', scores: 1 }, { id: 2, code: 'assist', name: 'Asistencia', scores: 0 }, { id: 3, code: 'yellow_card', name: 'Amarilla', scores: 0 }],
  }
  const team = { id: 1, name: 'Sub-15 Masculino', category: 'Sub-15', gender: 'male', color: '#0B3D91', sport: { id: 1, code: 'football', name: 'Fútbol' }, season: null }
  const basketSport = { id: 2, code: 'basketball', name: 'Básquetbol', periods: 4, period_minutes: 10, max_on_field: 5, unlimited_substitutions: true, positions: [], stat_types: [{ id: 9, code: 'point_2', name: 'Doble', scores: 2 }] }
  const basket = { id: 2, name: 'Básquet Juvenil', category: 'Juvenil', gender: 'mixed', color: '#F2B705', sport: { id: 2, code: 'basketball', name: 'Básquetbol' }, season: null }
  let scope: any = { sports: [{ id: 1, code: 'football', name: 'Fútbol' }], teams: [] }
  const roster = [
    { id: 15, first_name: 'Ana', last_name: 'López', full_name: 'Ana López', birthdate: '2011-03-02', gender: 'female', photo_url: null, jersey_number: 9, position: { id: 3, code: 'DEL', name: 'Delantero' }, active: true },
    { id: 18, first_name: 'Luis', last_name: 'Pérez', full_name: 'Luis Pérez', birthdate: '2011-06-10', gender: 'male', photo_url: null, jersey_number: 1, position: { id: 1, code: 'POR', name: 'Portero' }, active: true },
  ]
  const events: Record<number, any> = {}
  let nextId = 100
  const calls: { method: string; path: string; body: any; headers: Record<string, string> }[] = []

  const ok = (route: Route, data: unknown, status = 200, meta?: unknown) =>
    route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(meta ? { data, meta } : { data }) })

  page.route('**/api/**', async (route) => {
    const req = route.request()
    const url = new URL(req.url())
    const path = url.pathname.replace(/^\/api\//, '')
    const method = req.method()
    const body = req.postData() ? JSON.parse(req.postData()!) : null
    calls.push({ method, path, body, headers: req.headers() })
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
    if (path === 'catalog/sports') return ok(route, [sport, basketSport])
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
    if (pc === 'seasons') return ok(route, [])
    if (pc === 'invitations' && method === 'GET') return ok(route, [])
    if (pc === 'events' && method === 'GET') {
      const list = Object.values(events).map(({ sport: _s, callups, attendance, lineup, actions, player_stats, ...e }) => e)
      if (url.searchParams.get('pending_sheet') === '1') {
        return ok(route, list.filter((e: any) => e.type === 'match' && e.status !== 'cancelled' && !e.result_published_at && new Date(e.starts_at) < new Date()))
      }
      return ok(route, list)
    }
    if (pc === 'events' && method === 'POST') {
      const id = nextId++
      const e = {
        id, team_id: body.team_id, team_name: team.name, type: body.type, title: body.title,
        display_title: body.title ?? (body.opponent_name ? `vs. ${body.opponent_name}` : 'Partido'),
        starts_at: body.starts_at.replace(' ', 'T') + ':00-06:00', ends_at: null, location: body.location, opponent_name: body.opponent_name,
        home_away: body.home_away, status: 'scheduled', score_us: null, score_them: null, result_published_at: null, notes: body.notes,
        sport, callups: [], attendance: [], lineup: [], actions: [], player_stats: [],
      }
      events[id] = e
      return ok(route, e, 201)
    }
    const m = pc.match(/^events\/(\d+)(?:\/(callups|attendance|match-sheet))?$/)
    if (m) {
      const e = events[Number(m[1])]
      if (!e) return ok(route, null, 404)
      if (!m[2]) return ok(route, e)
      if (m[2] === 'callups') {
        const prev = new Set(e.callups.map((c: any) => c.player_id))
        e.callups = body.players.map((p: any) => ({ player_id: p.player_id, player_name: null, status: p.status ?? 'called', guardian_response: 'pending', responded_at: null }))
        return ok(route, { count: e.callups.length, newly_called: body.players.map((p: any) => p.player_id).filter((id: number) => !prev.has(id)) })
      }
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
