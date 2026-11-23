// Formas de las respuestas de la API (ver docs/API.md y los payload() de api/app/Models).
export type Role = 'org_admin' | 'director' | 'coach'

export interface Branding {
  name: string
  slug: string
  type: 'school' | 'team'
  active: boolean
  logo_url: string | null
  crest_url: string | null
  cover_url: string | null
  colors: { primary: string | null; secondary: string | null; on_primary: string | null }
  powered_by: string
}

export interface User {
  id: number
  name: string
  email: string
  must_change_password: boolean
  is_super_admin: boolean
}

/** Permisos para la interfaz (memberships[].permissions o GET access). La API valida todo igual. */
export interface OrgPermissions {
  invite_roles: InviteRole[]
  manage_members: boolean
  manage_directors: boolean
  manage_seasons: boolean
  manage_plans: boolean
  manage_branding: boolean
  /** "all" (admin) | ids de deportes donde puede crear equipos | [] */
  create_teams: 'all' | number[]
  delete_players: boolean
  director_scope: { sport_ids: number[]; team_ids: number[] } | null
}

export interface Membership {
  organization_id: number
  role: Role
  role_label: string
  branding_editable?: boolean
  permissions?: OrgPermissions
  organization: Branding
}

export interface Session {
  user: User
  memberships: Membership[]
  is_guardian: boolean
}

export interface LoginResult extends Session {
  token: string
  token_type: 'Bearer'
  expires_at: string | null
  admin_totp: null | 'setup' | 'verify'
}

export interface Position { id: number; code: string; name: string }
export interface StatType { id: number; code: string; name: string; scores: number }

export interface Sport {
  id: number
  code: string
  name: string
  periods?: number
  period_minutes?: number | null
  max_on_field?: number | null
  unlimited_substitutions?: boolean
  positions?: Position[]
  stat_types?: StatType[]
}

export interface Season { id: number; name: string; starts_on: string | null; ends_on: string | null; is_current: boolean }

export type Gender = 'male' | 'female' | 'mixed'

export interface Team {
  id: number
  name: string
  category: string | null
  gender: Gender | null
  color: string | null
  sport: Sport
  season: Season | null
}

export interface TeamDetail extends Team {
  sport: Sport & { positions: Position[]; stat_types: StatType[] }
  /** El coach solo se ve a sí mismo. */
  staff: { user_id: number; name: string | null; role: 'head_coach' | 'assistant' }[]
  can_manage?: boolean
}

export interface Player {
  id: number
  first_name: string
  last_name: string
  full_name: string
  birthdate: string | null
  gender: 'male' | 'female' | 'other' | null
  photo_url: string | null
  document_number?: string | null
  notes?: string | null
}

export interface RosterEntry extends Player {
  jersey_number: number | null
  position: Position | null
  active: boolean
}

export interface PlayerDetail extends Player {
  teams: { id: number; name: string; sport: string; jersey_number: number | null; sport_position_id: number | null; active: boolean }[]
  guardians: { user_id: number; name: string; email: string | null; relationship: string | null }[]
}

export type EventType = 'match' | 'training' | 'other'
export type EventStatus = 'scheduled' | 'finished' | 'cancelled'
export type HomeAway = 'home' | 'away' | 'neutral'

export interface PcEvent {
  id: number
  team_id: number
  team_name: string | null
  type: EventType
  title: string | null
  display_title: string
  starts_at: string
  ends_at: string | null
  location: string | null
  opponent_name: string | null
  home_away: HomeAway | null
  status: EventStatus
  score_us: number | null
  score_them: number | null
  result_published_at: string | null
  notes: string | null
}

export type CallupStatus = 'called' | 'reserve'
export type GuardianResponse = 'pending' | 'confirmed' | 'declined'
export type AttendanceStatus = 'present' | 'absent' | 'late' | 'excused'

export interface MatchAction {
  type?: 'stat' | 'sub_in' | 'sub_out' | 'note'
  stat_code?: string | null
  player_id?: number | null
  related_player_id?: number | null
  period?: number | null
  minute?: number | null
  value?: number | null
  note?: string | null
}

export interface LineupEntry {
  player_id: number
  player_name?: string | null
  is_starter: boolean
  sport_position_id: number | null
  jersey_number: number | null
  minutes_played: number | null
}

export interface EventDetail extends PcEvent {
  sport: Sport & { positions: Position[]; stat_types: StatType[] }
  callups: { player_id: number; player_name: string | null; status: CallupStatus; guardian_response: GuardianResponse; responded_at: string | null }[]
  attendance: { player_id: number; player_name: string | null; status: AttendanceStatus; note: string | null }[]
  lineup: LineupEntry[]
  actions: MatchAction[]
  player_stats: { player_id: number; minutes_played: number | null; stats: Record<string, number> }[]
}

export interface Member {
  id: number
  user_id: number
  name: string | null
  email: string | null
  role: Role
  role_label: string
  status: 'active' | 'invited' | 'disabled'
  last_login_at: string | null
  teams: { id: number; name: string | null; role: string }[]
  /** Solo para directores técnicos (lo ve el admin). */
  director_scope?: { sports: { id: number; code: string; name: string }[]; teams: { id: number; name: string }[] } | null
}

export type InviteRole = Role | 'guardian'

export interface Invitation {
  id: number
  email: string
  role: InviteRole
  role_label: string
  player_id: number | null
  team_ids: number[] | null
  sport_ids?: number[] | null
  expires_at: string
}

export interface PlanGrant {
  id: number
  user_id: number
  plan: 'pro' | 'premium'
  organization_id: number | null
  source: string
  pro_player_id: number | null
  starts_at: string | null
  ends_at: string | null
  revoked_at: string | null
  note: string | null
  user_name?: string | null
  user_email?: string | null
}

export interface PlanUsage {
  pro: { quota: number; used: number }
  premium: { quota: number; used: number }
}

export interface PublicInvitation {
  status: 'pending' | 'expired' | 'accepted'
  role: InviteRole
  role_label: string
  email_masked: string
  user_exists: boolean
  player_first_name: string | null
  organization: Branding
}
