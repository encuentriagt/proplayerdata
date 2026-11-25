import { useEffect, useId, useRef, useState } from 'react'
import {
  addDays, addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameDay, isSameMonth, parseISO, startOfMonth, startOfWeek,
} from 'date-fns'
import { es } from 'date-fns/locale'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import { capitalize, nowGt } from '../lib/dates'

const WEEK = { weekStartsOn: 1 as const }

/** Calendario propio (más grande y claro que el del navegador). `value` y `onChange` en "yyyy-MM-dd". */
export function DatePicker({ label, value, onChange, error }: { label: string; value: string; onChange: (v: string) => void; error?: string }) {
  const id = useId()
  const [open, setOpen] = useState(false)
  const selected = value ? parseISO(value) : null
  const [month, setMonth] = useState(() => selected ?? nowGt())
  const ref = useRef<HTMLDivElement>(null)
  const today = nowGt()

  useEffect(() => { if (open && selected) setMonth(selected) }, [open]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', close)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', close) }
  }, [open])

  const pick = (d: Date) => { onChange(format(d, 'yyyy-MM-dd')); setOpen(false) }
  const days = eachDayOfInterval({ start: startOfWeek(startOfMonth(month), WEEK), end: endOfWeek(endOfMonth(month), WEEK) })
  const heads = eachDayOfInterval({ start: startOfWeek(month, WEEK), end: addDays(startOfWeek(month, WEEK), 6) })

  return (
    <div ref={ref} className="relative">
      <label htmlFor={id} className="label">{label}</label>
      <button id={id} type="button" aria-haspopup="dialog" aria-expanded={open} aria-invalid={!!error}
        onClick={() => setOpen((o) => !o)}
        className="input flex items-center gap-2 text-left aria-[invalid=true]:border-red-700">
        <CalendarDays className="size-5 shrink-0 text-org-accent" aria-hidden />
        <span className={selected ? '' : 'text-black/40'}>
          {selected ? capitalize(format(selected, "EEEE d 'de' MMMM 'de' yyyy", { locale: es })) : 'Elija la fecha'}
        </span>
      </button>
      {error && <p className="mt-1 text-sm text-red-700">{error}</p>}

      {open && (
        <div role="dialog" aria-label={`Elegir ${label.toLowerCase()}`}
          className="absolute left-0 z-30 mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-2xl bg-white p-3 shadow-xl ring-1 ring-black/10">
          <div className="mb-2 flex items-center justify-between">
            <button type="button" className="btn-ghost size-10 p-0" aria-label="Mes anterior" onClick={() => setMonth((m) => addMonths(m, -1))}>
              <ChevronLeft className="size-5" aria-hidden />
            </button>
            <p className="font-bold" aria-live="polite">{capitalize(format(month, 'MMMM yyyy', { locale: es }))}</p>
            <button type="button" className="btn-ghost size-10 p-0" aria-label="Mes siguiente" onClick={() => setMonth((m) => addMonths(m, 1))}>
              <ChevronRight className="size-5" aria-hidden />
            </button>
          </div>
          <div className="grid grid-cols-7 text-center text-xs font-bold uppercase text-black/50">
            {heads.map((d) => <span key={d.toISOString()} className="py-1">{format(d, 'EEEEE', { locale: es })}</span>)}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {days.map((d) => {
              const isSel = selected && isSameDay(d, selected)
              const isToday = isSameDay(d, today)
              return (
                <button key={d.toISOString()} type="button" onClick={() => pick(d)}
                  aria-label={format(d, "d 'de' MMMM 'de' yyyy", { locale: es })} aria-pressed={!!isSel}
                  className={`grid aspect-square place-items-center rounded-xl text-sm font-semibold
                    ${isSel ? 'bg-org text-on-org' : isToday ? 'ring-2 ring-org-accent' : 'hover:bg-black/5'}
                    ${!isSameMonth(d, month) && !isSel ? 'text-black/30' : ''}`}>
                  {format(d, 'd')}
                </button>
              )
            })}
          </div>
          <div className="mt-2 flex gap-2 border-t border-black/5 pt-2">
            <button type="button" className="btn-secondary min-h-9 flex-1 text-sm" onClick={() => pick(today)}>Hoy</button>
            <button type="button" className="btn-secondary min-h-9 flex-1 text-sm" onClick={() => pick(addDays(today, 1))}>Mañana</button>
          </div>
        </div>
      )}
    </div>
  )
}

/** Horas cada 15 minutos, mostradas como en Guatemala ("7:00 a. m."). Valor "HH:mm". */
export const TIME_OPTIONS = Array.from({ length: 24 * 4 }, (_, i) => {
  const h = Math.floor(i / 4), m = (i % 4) * 15
  const value = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
  const h12 = h % 12 === 0 ? 12 : h % 12
  return { value, label: `${h12}:${String(m).padStart(2, '0')} ${h < 12 ? 'a. m.' : 'p. m.'}` }
})

export function TimeSelect({ label, value, onChange, error, optional }: { label: string; value: string; onChange: (v: string) => void; error?: string; optional?: boolean }) {
  const id = useId()
  // Si un evento viejo tiene una hora fuera de la lista (p. ej. 10:10), se agrega para no perderla.
  const options = value && !TIME_OPTIONS.some((o) => o.value === value)
    ? [...TIME_OPTIONS, { value, label: formatTime(value) }].sort((a, b) => a.value.localeCompare(b.value))
    : TIME_OPTIONS
  return (
    <div>
      <label htmlFor={id} className="label">{label}</label>
      <select id={id} className="input" value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={!!error}>
        <option value="">{optional ? 'Sin hora de fin' : 'Elija la hora'}</option>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {error && <p className="mt-1 text-sm text-red-700">{error}</p>}
    </div>
  )
}

export function formatTime(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number)
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${String(m).padStart(2, '0')} ${h < 12 ? 'a. m.' : 'p. m.'}`
}
