import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { sportIcon, useSport } from '../lib/sport'

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
      <span aria-hidden className={lg ? 'text-3xl leading-none sm:text-4xl' : 'text-xl leading-none'}>{sportIcon(selected.code)}</span>
      <span className={lg ? 'text-left' : ''}>
        {lg && <span className="hidden text-xs font-semibold uppercase text-black/50 sm:block">Deporte</span>}
        <span className={`font-bold ${lg ? 'text-base sm:text-lg' : 'text-sm'}`}>{selected.name}</span>
      </span>
      {many && <ChevronDown className={`${lg ? 'size-5' : 'size-4'} text-black/50`} aria-hidden />}
    </>
  )
  const box = `inline-flex shrink-0 items-center gap-2 rounded-2xl bg-white ring-1 ring-black/10 ${lg ? 'min-h-12 px-3 py-1.5 sm:min-h-16 sm:px-4 sm:py-2' : 'min-h-10 px-3'}`

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
                <span aria-hidden className="text-2xl">{sportIcon(s.code)}</span>
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
