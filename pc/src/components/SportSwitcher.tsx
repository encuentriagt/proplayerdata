import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { useSport } from '../lib/sport'
import { SportIcon } from './SportIcon'

/**
 * Deporte que se está viendo, con su ícono. Si el colegio tiene varios, al tocarlo se elige otro.
 * `size="lg"` junto al saludo de Inicio; `size="sm"` en el título de las demás pantallas.
 */
export function SportSwitcher({ size = 'sm' }: { size?: 'sm' | 'lg' }) {
  const { sports, selected, select } = useSport()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', close)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', close) }
  }, [open])

  if (!selected) return null
  const many = sports.length > 1
  const lg = size === 'lg'
  const face = (
    <>
      <SportIcon code={selected.code} size={lg ? 22 : 18} />
      <span className={`font-semibold ${lg ? 'text-base' : 'text-sm'}`}>{selected.name}</span>
      {many && <ChevronDown className="size-4 text-muted" aria-hidden />}
    </>
  )
  // Píldora blanca con borde (diseño)
  const box = `inline-flex shrink-0 items-center gap-2 rounded-full border border-line bg-surface text-ink ${lg ? 'min-h-12 px-4' : 'min-h-9 px-3'}`

  if (!many) return <div className={box} aria-label={`Deporte: ${selected.name}`}>{face}</div>

  return (
    <div ref={ref} className="relative">
      <button type="button" className={`${box} hover:ring-org/50`} aria-haspopup="listbox" aria-expanded={open}
        aria-label={`Deporte: ${selected.name}. Cambiar deporte`} onClick={() => setOpen((o) => !o)}>
        {face}
      </button>
      {open && (
        <ul role="listbox" aria-label="Elegir deporte" className="absolute right-0 z-30 mt-2 w-max min-w-48 max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl bg-white py-1 shadow-lg ring-1 ring-black/10">
          {sports.map((s) => (
            <li key={s.id} role="option" aria-selected={s.id === selected.id}>
              <button type="button" className="flex min-h-12 w-full items-center gap-3 px-4 text-left hover:bg-black/5"
                onClick={() => { select(s.id); setOpen(false) }}>
                <SportIcon code={s.code} size={22} />
                <span className="flex-1 font-semibold">{s.name}</span>
                {s.id === selected.id && <Check className="size-5 text-org-accent" aria-hidden />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
