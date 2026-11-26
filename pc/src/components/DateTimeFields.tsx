import { useEffect, useId, useRef, useState } from 'react'
import {
  addDays, addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameDay, isSameMonth, parseISO, startOfMonth, startOfWeek,
} from 'date-fns'
import { es } from 'date-fns/locale'
import { CalendarDays, ChevronLeft, ChevronRight, Clock, X } from 'lucide-react'
import { capitalize, nowGt } from '../lib/dates'

const WEEK = { weekStartsOn: 1 as const }

/** Calendario propio (más grande y claro que el del navegador). `value` y `onChange` en "yyyy-MM-dd". */
export function DatePicker({ label, value, onChange, error, compact = false, quick = false }: { label: string; value: string; onChange: (v: string) => void; error?: string; compact?: boolean; quick?: boolean }) {
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
        <span className={`truncate ${selected ? '' : 'text-black/40'}`}>
          {selected ? capitalize(format(selected, compact ? 'EEE d MMM' : "EEEE d 'de' MMMM 'de' yyyy", { locale: es })) : 'Elija la fecha'}
        </span>
      </button>
      {error && <p className="mt-1 text-sm text-err">{error}</p>}
      {quick && (
        <div className="mt-2 flex gap-2">
          {[['Hoy', 0], ['Mañana', 1]].map(([t, n]) => (
            <button key={t} type="button" onClick={() => pick(addDays(today, n as number))}
              className="min-h-9 rounded-full border border-line bg-surface px-3.5 text-sm hover:bg-black/5">{t}</button>
          ))}
        </div>
      )}

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

/** "HH:mm" → "3:30 p. m." */
export function formatTime(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number)
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${String(m).padStart(2, '0')} ${h < 12 ? 'a. m.' : 'p. m.'}`
}

const HOURS = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
const MINUTES = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55]

/**
 * Selector de hora como el de Android: primero la hora en un reloj (1–12), luego los minutos (de 5 en 5),
 * a. m./p. m. y Aceptar. Valor "HH:mm" (24 h).
 */
export function TimePicker({ label, value, onChange, error, optional }: { label: string; value: string; onChange: (v: string) => void; error?: string; optional?: boolean }) {
  const id = useId()
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<'hour' | 'minute'>('hour')
  const [h12, setH12] = useState<number | null>(null)
  const [min, setMin] = useState(0)
  const [pm, setPm] = useState(true)

  const start = () => {
    if (value) {
      const [h, m] = value.split(':').map(Number)
      setH12(h % 12 === 0 ? 12 : h % 12); setMin(m); setPm(h >= 12)
    } else {
      setH12(null); setMin(0); setPm(true)
    }
    setMode('hour'); setOpen(true)
  }
  const accept = () => {
    if (h12 === null) return
    const h24 = (h12 % 12) + (pm ? 12 : 0)
    onChange(`${String(h24).padStart(2, '0')}:${String(min).padStart(2, '0')}`)
    setOpen(false)
  }

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  const items = mode === 'hour' ? HOURS : MINUTES
  const current = mode === 'hour' ? h12 : min
  // Ángulo de la manecilla: 12 / 00 arriba, en sentido horario.
  const index = current === null ? -1 : mode === 'hour' ? HOURS.indexOf(current) : Math.round(current / 5) % 12
  const seg = (active: boolean) => `rounded-xl px-2 font-display text-6xl font-extrabold italic leading-none ${active ? 'bg-org/15 text-org-accent' : 'text-black/40 hover:bg-black/5'}`

  return (
    <div>
      <label htmlFor={id} className="label">{label}</label>
      <div className="flex gap-2">
        <button id={id} type="button" aria-haspopup="dialog" aria-invalid={!!error} onClick={start}
          className="input flex items-center gap-2 text-left aria-[invalid=true]:border-red-700">
          <Clock className="size-5 shrink-0 text-org-accent" aria-hidden />
          <span className={value ? '' : 'text-black/40'}>{value ? formatTime(value) : optional ? 'Sin hora de fin' : 'Elija la hora'}</span>
        </button>
        {optional && value && (
          <button type="button" className="btn-ghost shrink-0 px-3" aria-label={`Quitar ${label.toLowerCase()}`} onClick={() => onChange('')}>
            <X className="size-5" aria-hidden />
          </button>
        )}
      </div>
      {error && <p className="mt-1 text-sm text-red-700">{error}</p>}

      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}>
          <div role="dialog" aria-modal="true" aria-label={`Elegir ${label.toLowerCase()}`} className="w-full max-w-xs rounded-3xl bg-white p-5 shadow-xl">
            <p className="text-sm font-semibold text-black/60">{mode === 'hour' ? 'Elija la hora' : 'Elija los minutos'}</p>

            {/* Hora grande: se toca para cambiar entre hora y minutos */}
            <div className="mt-2 flex items-center justify-center gap-1">
              <button type="button" className={seg(mode === 'hour')} aria-label="Cambiar la hora" onClick={() => setMode('hour')}>
                {h12 ?? '--'}
              </button>
              <span className="font-display text-6xl font-extrabold italic text-black/40">:</span>
              <button type="button" className={seg(mode === 'minute')} aria-label="Cambiar los minutos" onClick={() => h12 !== null && setMode('minute')}>
                {String(min).padStart(2, '0')}
              </button>
              <div className="ml-2 flex flex-col gap-1" role="group" aria-label="Mañana o tarde">
                {([false, true] as const).map((isPm) => (
                  <button key={String(isPm)} type="button" aria-pressed={pm === isPm} onClick={() => setPm(isPm)}
                    className={`rounded-lg px-2 py-1 text-sm font-bold ring-1 ${pm === isPm ? 'bg-org text-on-org ring-org' : 'ring-black/15 text-black/60'}`}>
                    {isPm ? 'p. m.' : 'a. m.'}
                  </button>
                ))}
              </div>
            </div>

            {/* Reloj */}
            <div className="relative mx-auto mt-4 aspect-square w-full max-w-64 rounded-full bg-black/5">
              <span aria-hidden className="absolute left-1/2 top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-org" />
              {index >= 0 && (
                <span aria-hidden className="absolute left-1/2 top-1/2 h-[38%] w-0.5 origin-bottom -translate-x-1/2 bg-org"
                  style={{ transform: `translate(-50%, -100%) rotate(${index * 30}deg)` }} />
              )}
              {items.map((n, i) => {
                const angle = (i * 30 - 90) * (Math.PI / 180)
                const x = 50 + 38 * Math.cos(angle), y = 50 + 38 * Math.sin(angle)
                const active = i === index
                return (
                  <button key={n} type="button" onClick={() => {
                    if (mode === 'hour') { setH12(n); setMode('minute') } else setMin(n)
                  }}
                    aria-label={mode === 'hour' ? `${n} horas` : `${String(n).padStart(2, '0')} minutos`} aria-pressed={active}
                    className={`absolute grid size-11 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full text-base font-bold ${active ? 'bg-org text-on-org' : 'hover:bg-black/10'}`}
                    style={{ left: `${x}%`, top: `${y}%` }}>
                    {mode === 'hour' ? n : String(n).padStart(2, '0')}
                  </button>
                )
              })}
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>Cancelar</button>
              <button type="button" className="btn-primary" disabled={h12 === null} onClick={accept}>Aceptar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
