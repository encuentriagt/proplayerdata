import type { AttendanceStatus, CallupStatus, EventStatus, EventType, GuardianResponse, HomeAway } from './types'

export const EVENT_TYPE: Record<EventType, string> = { match: 'Partido', training: 'Entrenamiento', other: 'Otro' }
export const EVENT_TYPE_COLOR: Record<EventType, string> = {
  match: 'bg-org-soft text-org-accent',
  training: 'bg-info-bg text-info-ink',
  other: 'bg-[#e6e4e3] text-ink',
}

/** Colores de etiqueta del diseño. */
export const CHIP = {
  draft: 'bg-muted text-white',
  pendingSheet: 'bg-ppd-star text-ink',
  cancelled: 'bg-err-bg text-err',
  timePending: 'bg-info-bg text-info-ink',
  neutral: 'bg-[#e6e4e3] text-ink',
  ok: 'bg-ok-bg text-ok',
  err: 'bg-err-bg text-err',
} as const
export const EVENT_STATUS: Record<EventStatus, string> = { scheduled: 'Programado', finished: 'Finalizado', cancelled: 'Cancelado' }
export const HOME_AWAY: Record<HomeAway, string> = { home: 'Local', away: 'Visita', neutral: 'Neutral' }
export const CALLUP: Record<CallupStatus, string> = { called: 'Convocado', reserve: 'Reserva' }
export const GUARDIAN_RESPONSE: Record<GuardianResponse, { label: string; cls: string }> = {
  pending: { label: 'Pendiente', cls: 'bg-[#e6e4e3] text-ink' },
  confirmed: { label: 'Confirmado', cls: 'bg-ok-bg text-ok' },
  declined: { label: 'No asistirá', cls: 'bg-err-bg text-err' },
}
// Asistencia: Asiste (A), No asiste con aviso (NA), Lesión (L), No justificado (NJ).
// En la API: present, excused, injured, absent. "late" ya no se ofrece; los registros viejos se muestran como Asiste.
// cls: relleno al elegir · outline: botón sin elegir (borde y letra del color) · soft: etiqueta del resumen.
export const ATTENDANCE: Record<AttendanceStatus, { label: string; short: string; cls: string; outline: string; soft: string }> = {
  present: { label: 'Asiste', short: 'A', cls: 'bg-ok text-white', outline: 'border-ok/60 text-ok', soft: 'bg-ok text-white' },
  excused: { label: 'No asiste', short: 'NA', cls: 'bg-[#e6e4e3] text-ink', outline: 'border-line text-ink', soft: 'bg-[#e6e4e3] text-ink' },
  injured: { label: 'Lesión', short: 'L', cls: 'bg-ppd-star text-ink', outline: 'border-ppd-star/70 text-[#8a5208]', soft: 'bg-ppd-star text-ink' },
  absent: { label: 'No justificado', short: 'NJ', cls: 'bg-err text-white', outline: 'border-err/60 text-err', soft: 'bg-err text-white' },
  late: { label: 'Asiste', short: 'A', cls: 'bg-ok text-white', outline: 'border-ok/60 text-ok', soft: 'bg-ok text-white' },
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
