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
// Asistencia: Asiste (A), No asiste con aviso (NA), Lesión (L), No justificado (NJ).
// En la API: present, excused, injured, absent. "late" ya no se ofrece; los registros viejos se muestran como Asiste.
export const ATTENDANCE: Record<AttendanceStatus, { label: string; short: string; cls: string }> = {
  present: { label: 'Asiste', short: 'A', cls: 'bg-emerald-600 text-white' },
  excused: { label: 'No asiste', short: 'NA', cls: 'bg-sky-700 text-white' },
  injured: { label: 'Lesión', short: 'L', cls: 'bg-amber-500 text-ink' },
  absent: { label: 'No justificado', short: 'NJ', cls: 'bg-red-700 text-white' },
  late: { label: 'Asiste', short: 'A', cls: 'bg-emerald-600 text-white' },
}
export const ATTENDANCE_ORDER: AttendanceStatus[] = ['present', 'excused', 'injured', 'absent']
/** Registros anteriores con "late" se tratan como "present" (el jugador llegó). */
export function normalizeAttendance(s: AttendanceStatus): AttendanceStatus {
  return s === 'late' ? 'present' : s
}
export const TEAM_GENDER = { male: 'Masculino', female: 'Femenino', mixed: 'Mixto' } as const
export const PLAYER_GENDER = { male: 'Masculino', female: 'Femenino', other: 'Otro' } as const
export const ROLE_LABEL = { org_admin: 'Administrador', director: 'Director técnico', coach: 'Coach', guardian: 'Padre o madre' } as const

/** Título que se muestra. La API ya arma el de partidos como "{equipo} vs {rival}" (display_title). */
export function eventTitle(e: { display_title: string }): string {
  return e.display_title
}
