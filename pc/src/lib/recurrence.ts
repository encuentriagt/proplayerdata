import { addDays, addMonths, format, getISODay, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'

/** Días de la semana en formato ISO: 1 = lunes … 7 = domingo. */
export const WEEKDAYS = [
  { iso: 1, short: 'L', name: 'lunes' },
  { iso: 2, short: 'M', name: 'martes' },
  { iso: 3, short: 'M', name: 'miércoles' },
  { iso: 4, short: 'J', name: 'jueves' },
  { iso: 5, short: 'V', name: 'viernes' },
  { iso: 6, short: 'S', name: 'sábado' },
  { iso: 7, short: 'D', name: 'domingo' },
] as const

/** Máximo de entrenos por serie (la API debe validar lo mismo). */
export const MAX_SERIES = 200

export type UntilMode = '1m' | '3m' | '6m' | 'custom'

/** Fecha final de la serie según la opción elegida ("yyyy-MM-dd"). */
export function untilDate(from: string, mode: UntilMode, custom?: string): string | null {
  if (!from) return null
  const f = parseISO(from)
  if (mode === '1m') return format(addMonths(f, 1), 'yyyy-MM-dd')
  if (mode === '3m') return format(addMonths(f, 3), 'yyyy-MM-dd')
  if (mode === '6m') return format(addMonths(f, 6), 'yyyy-MM-dd')
  return custom || null
}

/** Todas las fechas entre `from` y `until` (inclusive) que caen en los días elegidos. */
export function seriesDates(from: string, until: string | null, weekdays: number[]): string[] {
  if (!from || !until || !weekdays.length || until < from) return []
  const out: string[] = []
  for (let d = parseISO(from); format(d, 'yyyy-MM-dd') <= until; d = addDays(d, 1)) {
    if (weekdays.includes(getISODay(d))) out.push(format(d, 'yyyy-MM-dd'))
    if (out.length > MAX_SERIES) break
  }
  return out
}

/** [1, 3] → "lunes y miércoles" */
export function weekdaysText(weekdays: number[]): string {
  const names = WEEKDAYS.filter((w) => weekdays.includes(w.iso)).map((w) => w.name)
  return names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}`
}

/**
 * Texto del aviso que recibirán los padres al programar entrenos (sin nombres de jugadores).
 * La API arma el push real; la PC lo muestra en la confirmación para que el coach sepa qué se enviará.
 */
export function trainingNoticeText(opts: { team: string; dates: string[]; weekdays?: number[]; time: string }): string {
  const { team, dates, weekdays, time } = opts
  const [h, m] = time.split(':').map(Number)
  const hora = `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'a. m.' : 'p. m.'}`
  const d = (iso: string) => format(parseISO(iso), "d 'de' MMMM", { locale: es })
  if (dates.length <= 1) return `Se programó un entreno de ${team}: ${format(parseISO(dates[0]), "EEEE d 'de' MMMM", { locale: es })}, ${hora}`
  return `Se programaron ${dates.length} entrenos de ${team}: ${weekdaysText(weekdays ?? [])}, ${hora}, del ${d(dates[0])} al ${d(dates[dates.length - 1])}.`
}
