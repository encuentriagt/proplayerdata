import { canCreateTeamInSport, canCreateTeams, canManageTeam, hasAdminArea, NO_PERMISSIONS, permissionsFor } from './auth'
import type { Membership, OrgPermissions } from './types'

const admin: OrgPermissions = { ...NO_PERMISSIONS, invite_roles: ['org_admin', 'director', 'coach', 'guardian'], manage_members: true, manage_directors: true, manage_seasons: true, manage_plans: true, manage_branding: true, create_teams: 'all', delete_players: true }
const director: OrgPermissions = { ...NO_PERMISSIONS, invite_roles: ['coach', 'guardian'], manage_members: true, create_teams: [1], director_scope: { sport_ids: [1], team_ids: [12] } }
const coach: OrgPermissions = { ...NO_PERMISSIONS, invite_roles: ['guardian'] }
const futbol = (id: number) => ({ id, sport: { id: 1 } })
const basquet = (id: number) => ({ id, sport: { id: 2 } })

describe('permisos de la interfaz (vienen de la API)', () => {
  it('toma permissions de la membresía; sin ella, nada', () => {
    const m = { organization_id: 1, role: 'coach', role_label: 'Coach', permissions: coach } as Membership
    expect(permissionsFor([m])).toBe(coach)
    expect(permissionsFor([{ ...m, permissions: undefined }])).toEqual(NO_PERMISSIONS)
  })

  it('crear equipos: admin en todo, director solo en sus deportes, coach nunca', () => {
    expect(canCreateTeams(admin) && canCreateTeamInSport(admin, 99)).toBe(true)
    expect(canCreateTeamInSport(director, 1)).toBe(true)
    expect(canCreateTeamInSport(director, 2)).toBe(false)
    expect(canCreateTeams(coach)).toBe(false)
  })

  it('administrar un equipo: can_manage manda; si no viene, se usa el alcance', () => {
    expect(canManageTeam(director, futbol(5))).toBe(true) // deporte completo
    expect(canManageTeam(director, basquet(12))).toBe(true) // equipo suelto
    expect(canManageTeam(director, basquet(13))).toBe(false)
    expect(canManageTeam(director, { ...futbol(5), can_manage: false })).toBe(false)
    expect(canManageTeam(coach, futbol(5))).toBe(false)
    expect(canManageTeam(admin, basquet(13))).toBe(true)
  })

  it('área de administración: admin y director sí, coach no', () => {
    expect(hasAdminArea(admin)).toBe(true)
    expect(hasAdminArea(director)).toBe(true)
    expect(hasAdminArea(coach)).toBe(false)
  })
})
