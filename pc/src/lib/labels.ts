import type { AttendanceStatus, CallupStatus, EventStatus, EventType, GuardianResponse, HomeAway } from './types'

export const EVENT_TYPE: Record<EventType, string> = { match: 'Partido', training: 'Entrenamiento', other: 'Otro' }
export const EVENT_TYPE_COLOR: Record<EventType, string> = {
  match: 'bg-org text-on-org',
  training: 'bg-sky-700 text-white',
  other: 'bg-stone-600 text-white',
}
export const EVENT_STATUS: Record<EventStatus, string> = { scheduled: 'Programado', finished: 'Finalizado', cancelled: 'Cancelado' }
export const HOME_AWAY: Record<HomeAway, string> = { home: 'Local', away: 'Visita', neutral: 'Neutral' }
export const CALLUP: Record<CallupStatus, string> = { called: 'Convocado', reserve: 'Reserva' }
export const GUARDIAN_RESPONSE: Record<GuardianResponse, { label: string; cls: string }> = {
  pending: { label: 'Pendiente', cls: 'bg-stone-100 text-stone-700' },
  confirmed: { label: 'Confirmado', cls: 'bg-emerald-100 text-emerald-800' },
  declined: { label: 'No asistirá', cls: 'bg-red-100 text-red-800' },
}
export const ATTENDANCE: Record<AttendanceStatus, { label: string; short: string; cls: string }> = {
  present: { label: 'Presente', short: 'P', cls: 'bg-emerald-600 text-white' },
  late: { label: 'Tarde', short: 'T', cls: 'bg-amber-500 text-ink' },
  absent: { label: 'Ausente', short: 'A', cls: 'bg-red-700 text-white' },
  excused: { label: 'Excusa', short: 'E', cls: 'bg-sky-700 text-white' },
}
export const ATTENDANCE_ORDER: AttendanceStatus[] = ['present', 'late', 'absent', 'excused']
export const TEAM_GENDER = { male: 'Masculino', female: 'Femenino', mixed: 'Mixto' } as const
export const PLAYER_GENDER = { male: 'Masculino', female: 'Femenino', other: 'Otro' } as const
export const ROLE_LABEL = { org_admin: 'Administrador', director: 'Director deportivo', coach: 'Coach', guardian: 'Padre o madre' } as const
