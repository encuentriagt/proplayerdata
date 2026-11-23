import { canCreateTeamInSport, canCreateTeams, hasAdminArea, NO_PERMISSIONS, permissionsFor } from './auth'
import type { Membership, OrgPermissions } from './types'

const admin: OrgPermissions = { ...NO_PERMISSIONS, invite_roles: ['org_admin', 'director', 'coach', 'guardian'], manage_members: true, manage_directors: true, manage_seasons: true, manage_plans: true, manage_branding: true, create_teams: 'all', delete_players: true, create_players_without_team: true }
const director: OrgPermissions = { ...NO_PERMISSIONS, invite_roles: ['coach', 'guardian'], manage_members: true, create_teams: [1], director_scope: { sport_ids: [1], team_ids: [12] } }
const coach: OrgPermissions = { ...NO_PERMISSIONS, invite_roles: ['guardian'] }

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

  it('área de administración: admin y director sí, coach no', () => {
    expect(hasAdminArea(admin)).toBe(true)
    expect(hasAdminArea(director)).toBe(true)
    expect(hasAdminArea(coach)).toBe(false)
  })
})
