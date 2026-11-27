import { useEffect, useId, useRef, useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import type { Team } from '../lib/types'

/**
 * Selector de equipos con casillas: uno, varios o todos.
 * `value` vacío = todos los equipos.
 */
export function TeamPicker({ teams, value, onChange }: { teams: Team[]; value: number[]; onChange: (ids: number[]) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const panelId = useId()
  const all = value.length === 0
  const selected = new Set(value)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])

  const toggle = (id: number) => {
    // Con "Todos" marcado, desmarcar un equipo deja los demás
    const next = new Set(all ? teams.map((t) => t.id) : selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    // Marcar todos equivale a "Todos los equipos"
    onChange(next.size === teams.length ? [] : teams.filter((t) => next.has(t.id)).map((t) => t.id))
  }

  const label = all
    ? 'Todos los equipos'
    : value.length === 1
      ? teams.find((t) => t.id === value[0])?.name ?? '1 equipo'
      : `${value.length} equipos`

  return (
    <div ref={ref} className="sm:relative">
      <button
        type="button"
        className="input flex min-h-10 w-auto max-w-[16rem] items-center gap-2 py-1 text-left text-sm"
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={`Equipos: ${label}`}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="truncate">{label}</span>
        <ChevronDown aria-hidden className="ml-auto size-4 shrink-0 text-muted" />
      </button>
      {open && (
        <fieldset id={panelId} className="absolute inset-x-0 z-30 mt-1 max-h-80 overflow-y-auto sm:inset-x-auto sm:right-0 sm:w-72 rounded-[12px] border border-line bg-surface p-1.5 shadow-[0_8px_28px_rgba(32,30,29,0.14)]">
          <legend className="sr-only">Equipos que se muestran</legend>
          <Option label="Todos los equipos" checked={all} onChange={() => onChange([])} strong />
          <hr className="my-1 border-line" />
          {teams.map((t) => (
            <Option key={t.id} label={t.name} color={t.color} checked={all || selected.has(t.id)} onChange={() => toggle(t.id)} onlyThis={() => { onChange([t.id]); setOpen(false) }} />
          ))}
          {!teams.length && <p className="px-3 py-2 text-sm text-muted">No hay equipos en este deporte.</p>}
        </fieldset>
      )}
    </div>
  )
}

function Option({ label, checked, onChange, color, strong, onlyThis }: { label: string; checked: boolean; onChange: () => void; color?: string | null; strong?: boolean; onlyThis?: () => void }) {
  return (
    <div className="group flex items-center rounded-[10px] hover:bg-black/5">
      <label className="flex min-h-11 flex-1 cursor-pointer items-center gap-3 px-2.5 text-sm">
        <input type="checkbox" className="peer sr-only" checked={checked} onChange={onChange} />
        <span aria-hidden className={`grid size-5 shrink-0 place-items-center rounded-[6px] border-2 peer-focus-visible:ring-2 peer-focus-visible:ring-org ${checked ? 'border-org bg-org text-on-org' : 'border-[#8a8380] bg-surface'}`}>
          {checked && <Check className="size-3.5" strokeWidth={3} />}
        </span>
        {color && <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ background: color }} />}
        <span className={strong ? 'font-semibold' : ''}>{label}</span>
      </label>
      {onlyThis && (
        <button type="button" onClick={onlyThis} className="mr-1.5 rounded-md px-2 py-1 text-xs font-semibold text-org-accent opacity-0 group-hover:opacity-100 focus-visible:opacity-100" aria-label={`Solo ${label}`}>
          Solo este
        </button>
      )}
    </div>
  )
}
