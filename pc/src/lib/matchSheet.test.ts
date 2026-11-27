import { loadDraft, saveDraft, clearDraft, scoredByPlayers, sheetFromEvent, statCount, tapMinus, tapPlus, toPayload, visibleStatTypes, rivalScore, goalkeeperFor, kickPlus, kickMinus, shootoutUs } from './matchSheet'
import type { EventDetail, RosterEntry, StatType } from './types'

const roster: RosterEntry[] = [
  { id: 15, first_name: 'Ana', last_name: 'López', full_name: 'Ana López', birthdate: null, gender: null, photo_url: null, jersey_number: 9, position: { id: 3, code: 'DEL', name: 'Delantero' }, active: true },
  { id: 18, first_name: 'Luis', last_name: 'Pérez', full_name: 'Luis Pérez', birthdate: null, gender: null, photo_url: null, jersey_number: 4, position: null, active: true },
  { id: 20, first_name: 'Eva', last_name: 'Ruiz', full_name: 'Eva Ruiz', birthdate: null, gender: null, photo_url: null, jersey_number: null, position: null, active: true },
]

const statTypes: StatType[] = [
  { id: 1, code: 'goal', name: 'Gol', scores: 1 },
  { id: 2, code: 'assist', name: 'Asistencia', scores: 0 },
  { id: 3, code: 'own_goal', name: 'Autogol', scores: 1 },
]

function event(over: Partial<EventDetail> = {}): EventDetail {
  return {
    id: 7, team_id: 1, team_name: 'Sub-15', type: 'match', title: null, display_title: 'vs. Rival', starts_at: '2026-11-21T10:00:00-06:00',
    ends_at: null, location: null, opponent_name: 'Rival', home_away: 'home', status: 'scheduled', score_us: null, score_them: null,
    result_published_at: null, notes: null,
    sport: { id: 1, code: 'soccer', name: 'Soccer', positions: [], stat_types: statTypes }, callups: [], attendance: [], lineup: [], actions: [], player_stats: [], ...over,
  }
}

describe('ficha del partido', () => {
  it('precarga a los convocados como "jugó" si aún no hay alineación', () => {
    const s = sheetFromEvent(event({ callups: [
      { player_id: 15, player_name: null, status: 'called', guardian_response: 'confirmed', responded_at: null },
      { player_id: 18, player_name: null, status: 'reserve', guardian_response: 'pending', responded_at: null },
    ] }), roster)
    expect(s.lineup[15].played).toBe(true)
    expect(s.lineup[18].played).toBe(false)
    expect(s.lineup[15].jersey_number).toBe(9)
    expect(s.lineup[15].sport_position_id).toBe(3)
  })

  it('carga la ficha guardada (alineación, estadísticas y cambios)', () => {
    const s = sheetFromEvent(event({
      score_us: 2, score_them: 1,
      lineup: [{ player_id: 15, is_starter: true, sport_position_id: 3, jersey_number: 9, minutes_played: 60 }],
      actions: [
        { type: 'stat', stat_code: 'goal', player_id: 15, value: 2, minute: null, period: null },
        { type: 'sub_in', player_id: 18, related_player_id: 15, minute: 40 },
        { type: 'note', note: 'Lluvia' },
      ],
    }), roster)
    expect(s.score_us).toBe(2)
    expect(statCount(s, 15, 'goal')).toBe(2)
    expect(s.subs).toEqual([{ in_id: 18, out_id: 15, minute: 40 }])
    expect(s.other).toHaveLength(1)
  })

  it('+ agrega una acción y marca al jugador; − quita la última', () => {
    let s = sheetFromEvent(event(), roster)
    s = tapPlus(s, 20, 'goal')
    s = tapPlus(s, 20, 'goal')
    expect(statCount(s, 20, 'goal')).toBe(2)
    expect(s.lineup[20].played).toBe(true)
    s = tapMinus(s, 20, 'goal')
    expect(statCount(s, 20, 'goal')).toBe(1)
    s = tapMinus(tapMinus(s, 20, 'goal'), 20, 'goal')
    expect(statCount(s, 20, 'goal')).toBe(0)
  })

  it('− resta 1 a una acción con valor mayor a 1', () => {
    let s = sheetFromEvent(event({ actions: [{ type: 'stat', stat_code: 'goal', player_id: 15, value: 3 }] }), roster)
    s = tapMinus(s, 15, 'goal')
    expect(s.stats).toEqual([{ stat_code: 'goal', player_id: 15, value: 2, minute: null, period: null }])
  })

  it('suma anotaciones según el catálogo sin contar autogoles', () => {
    let s = sheetFromEvent(event(), roster)
    s = tapPlus(tapPlus(tapPlus(s, 15, 'goal'), 18, 'assist'), 18, 'own_goal')
    expect(scoredByPlayers(s, statTypes)).toBe(1)
  })

  it('con el catálogo, + y − de un gol actualizan el marcador de nuestro equipo', () => {
    let s = { ...sheetFromEvent(event(), roster), score_them: 2 }
    s = tapPlus(tapPlus(s, 15, 'goal', statTypes), 18, 'goal', statTypes)
    expect(s.score_us).toBe(2)
    s = tapPlus(s, 18, 'assist', statTypes)
    expect(s.score_us).toBe(2)
    s = tapMinus(s, 15, 'goal', statTypes)
    expect(s.score_us).toBe(1)
    expect(s.score_them).toBe(2)
  })

  it('gol del rival: suma gol en contra al portero que jugó (el titular si hubo dos) y − lo quita', () => {
    const positions = [{ id: 1, code: 'POR', name: 'Portero' }, { id: 3, code: 'DEL', name: 'Delantero' }]
    const types = [...statTypes, { id: 9, code: 'goal_conceded', name: 'Gol en contra', scores: 0 }]
    let s = sheetFromEvent(event(), roster)
    // Sin portero que jugó: solo cambia el marcador
    s = rivalScore(s, 1, types, positions)
    expect(s.score_them).toBe(1)
    expect(s.stats).toHaveLength(0)
    s.lineup[18] = { ...s.lineup[18], played: true, sport_position_id: 1 }
    s.lineup[15] = { ...s.lineup[15], played: true, is_starter: true, sport_position_id: 1 }
    expect(goalkeeperFor(s, positions)).toBe(15)
    s = rivalScore(rivalScore(s, 1, types, positions), 1, types, positions)
    expect(s.score_them).toBe(3)
    expect(statCount(s, 15, 'goal_conceded')).toBe(2)
    s = rivalScore(s, -1, types, positions)
    expect(s.score_them).toBe(2)
    expect(statCount(s, 15, 'goal_conceded')).toBe(1)
    expect(s.score_us).toBe(0)
    // Sin "Gol en contra" en el catálogo, no se agrega nada
    expect(rivalScore(s, 1, statTypes, positions).stats).toEqual(s.stats)
  })

  it('penales: solo se envían si el marcador está empatado; los nuestros se suman con los anotados', () => {
    let s = { ...sheetFromEvent(event(), roster), score_us: 1, score_them: 1 }
    expect(toPayload(s, true).shootout).toBeNull()
    s = { ...s, shootout: { on: true, them: 3, kicks: [] } }
    s = kickPlus(kickPlus(kickPlus(s, 15, true), 18, false), 18, true)
    s = kickMinus(s, 18, false)
    expect(shootoutUs(s)).toBe(2)
    expect(toPayload(s, true).shootout).toEqual({ score_us: 2, score_them: 3, kicks: [{ player_id: 15, scored: true }, { player_id: 18, scored: true }] })
    // Si el marcador deja de estar empatado, no se envían
    expect(toPayload({ ...s, score_us: 2 }, true).shootout).toBeNull()
  })

  it('la ficha no muestra asistencia, autogol ni atajada', () => {
    const codes = visibleStatTypes([...statTypes, { id: 9, code: 'save', name: 'Atajada', scores: 0 }]).map((t) => t.code)
    expect(codes).toContain('goal')
    expect(codes).not.toContain('assist')
    expect(codes).not.toContain('own_goal')
    expect(codes).not.toContain('save')
  })

  it('arma el cuerpo de PUT match-sheet como lo espera la API', () => {
    let s = sheetFromEvent(event({ callups: [{ player_id: 15, player_name: null, status: 'called', guardian_response: 'pending', responded_at: null }] }), roster)
    s = { ...tapPlus(s, 15, 'goal'), score_us: 1, score_them: 0, subs: [{ in_id: 18, out_id: 15, minute: 40 }, { in_id: null, out_id: null, minute: null }] }
    s.lineup[15] = { ...s.lineup[15], is_starter: true, minutes_played: 40 }
    const p = toPayload(s, true)
    expect(p).toEqual({
      score_us: 1, score_them: 0, publish: true,
      lineup: [{ player_id: 15, is_starter: true, sport_position_id: 3, jersey_number: 9, minutes_played: 40 }],
      actions: [
        { stat_code: 'goal', player_id: 15, value: 1 },
        { type: 'sub_in', player_id: 18, related_player_id: 15, minute: 40 },
      ],
      shootout: null,
    })
  })

  it('guarda y recupera el borrador local', () => {
    const s = tapPlus(sheetFromEvent(event(), roster), 15, 'goal')
    saveDraft('colegio-demo', 7, s)
    expect(loadDraft('colegio-demo', 7)?.state.stats).toHaveLength(1)
    expect(loadDraft('colegio-demo', 8)).toBeNull()
    clearDraft('colegio-demo', 7)
    expect(loadDraft('colegio-demo', 7)).toBeNull()
  })
})
