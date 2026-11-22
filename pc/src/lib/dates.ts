import { format as fnsFormat } from 'date-fns'
import { es } from 'date-fns/locale'

// Guatemala no tiene horario de verano: siempre UTC−6. Las fechas se muestran en hora de Guatemala
// aunque el navegador esté en otra zona.
const GT_OFFSET_MIN = -6 * 60

/** Fecha "de pared" en Guatemala como Date local (solo para formatear). */
export function toGt(iso: string | Date): Date {
  const d = typeof iso === 'string' ? new Date(iso) : iso
  const utc = d.getTime() + d.getTimezoneOffset() * 60_000
  return new Date(utc + GT_OFFSET_MIN * 60_000)
}

export function nowGt(): Date {
  return toGt(new Date())
}

export function fmt(iso: string | Date, pattern: string): string {
  return fnsFormat(toGt(iso), pattern, { locale: es })
}

/** YYYY-MM-DD de una fecha "de pared". */
export function ymd(d: Date): string {
  return fnsFormat(d, 'yyyy-MM-dd')
}

/** Valor para <input type="datetime-local"> a partir de ISO de la API. */
export function toInputValue(iso: string | null | undefined): string {
  return iso ? fnsFormat(toGt(iso), "yyyy-MM-dd'T'HH:mm") : ''
}

/** "YYYY-MM-DDTHH:mm" (hora de Guatemala) → "YYYY-MM-DD HH:mm", formato que acepta la API. */
export function fromInputValue(v: string): string | null {
  return v ? v.replace('T', ' ') : null
}

export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}
