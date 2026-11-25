import { useState } from 'react'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { Repeat } from 'lucide-react'
import { capitalize } from '../lib/dates'
import { MAX_SERIES, WEEKDAYS, seriesDates, untilDate, weekdaysText, type UntilMode } from '../lib/recurrence'
import { DatePicker } from './DateTimeFields'

export interface Recurrence { repeat: boolean; weekdays: number[]; mode: UntilMode; custom: string }

const long = (d: string) => capitalize(format(parseISO(d), "EEEE d 'de' MMMM", { locale: es }))
const short = (d: string) => format(parseISO(d), "EEE d MMM", { locale: es })

/** "Se repite": días de la semana y hasta cuándo, con vista previa de las fechas. */
export function RecurrenceFields({ value, onChange, startDate }: { value: Recurrence; onChange: (v: Recurrence) => void; startDate: string }) {
  const [showAll, setShowAll] = useState(false)
  const set = (patch: Partial<Recurrence>) => onChange({ ...value, ...patch })
  const until = untilDate(startDate, value.mode, value.custom)
  const dates = value.repeat ? seriesDates(startDate, until, value.weekdays) : []
  const tooMany = dates.length > MAX_SERIES

  const modes: { mode: UntilMode; label: string }[] = [
    { mode: '1m', label: '1 mes' },
    { mode: '3m', label: '3 meses' },
    { mode: '6m', label: '6 meses' },
    { mode: 'custom', label: 'Otra fecha' },
  ]

  return (
    <section aria-labelledby="repeat-h" className="rounded-2xl border border-black/10 p-3">
      <label className="flex min-h-11 cursor-pointer items-center gap-3">
        <input type="checkbox" className="size-5 accent-[var(--org-accent)]" checked={value.repeat}
          onChange={(e) => onChange({
            ...value, repeat: e.target.checked,
            // Por defecto, el día de la semana de la fecha elegida.
            weekdays: e.target.checked && !value.weekdays.length && startDate ? [Number(format(parseISO(startDate), 'i'))] : value.weekdays,
          })} />
        <Repeat className="size-5 text-org-accent" aria-hidden />
        <span id="repeat-h" className="font-bold">Se repite</span>
      </label>

      {value.repeat && (
        <div className="mt-2 space-y-3">
          {!startDate && <p className="text-sm text-amber-900">Elija primero la fecha del primer entreno.</p>}
          <fieldset>
            <legend className="label">Días</legend>
            <div className="grid max-w-sm grid-cols-7 gap-1">
              {WEEKDAYS.map((w) => {
                const on = value.weekdays.includes(w.iso)
                return (
                  <button key={w.iso} type="button" aria-pressed={on} aria-label={w.name}
                    onClick={() => set({ weekdays: on ? value.weekdays.filter((x) => x !== w.iso) : [...value.weekdays, w.iso].sort() })}
                    className={`aspect-square min-h-10 w-full rounded-full text-sm font-bold ring-1 ${on ? 'bg-org text-on-org ring-org' : 'bg-white ring-black/15 hover:bg-black/5'}`}>
                    {w.short}
                  </button>
                )
              })}
            </div>
          </fieldset>

          <fieldset>
            <legend className="label">Hasta</legend>
            <div className="flex flex-wrap gap-1.5">
              {modes.map((m) => (
                <button key={m.mode} type="button" aria-pressed={value.mode === m.mode} onClick={() => set({ mode: m.mode })}
                  className={`min-h-10 rounded-full px-3 text-sm font-semibold ring-1 ${value.mode === m.mode ? 'bg-org text-on-org ring-org' : 'bg-white ring-black/15 hover:bg-black/5'}`}>
                  {m.label}
                </button>
              ))}
            </div>
            {value.mode === 'custom' && <div className="mt-2"><DatePicker label="Último día" value={value.custom} onChange={(d) => set({ custom: d })} /></div>}
          </fieldset>

          <div aria-live="polite" className="rounded-xl bg-black/[0.03] p-3 text-sm">
            {!value.weekdays.length ? 'Elija al menos un día.'
              : !dates.length ? 'No hay fechas en ese periodo.'
              : tooMany ? `Son más de ${MAX_SERIES} entrenos. Acorte el periodo o quite días.`
              : (
                <>
                  <p>
                    Se crearán <strong>{dates.length} entrenos</strong>, cada {weekdaysText(value.weekdays)},
                    del {long(dates[0])} al {long(dates[dates.length - 1])}.
                  </p>
                  <button type="button" className="mt-1 font-semibold text-org-accent underline" onClick={() => setShowAll((s) => !s)}>
                    {showAll ? 'Ocultar fechas' : 'Ver fechas'}
                  </button>
                  {showAll && <p className="mt-1 text-black/70">{dates.map(short).join(' · ')}</p>}
                </>
              )}
          </div>
        </div>
      )}
    </section>
  )
}
