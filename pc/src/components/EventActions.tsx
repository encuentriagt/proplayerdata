import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MoreVertical, Pencil, Trash2 } from 'lucide-react'
import { eventTitle } from '../lib/labels'
import { useOrg } from '../lib/org'
import { usePcMutation } from '../lib/queries'
import type { PcEvent } from '../lib/types'
import { ConfirmDialog } from './ConfirmDialog'
import { ErrorAlert } from './ui'

/** Menú ⋮ de una tarjeta de partido/entreno: Editar y Eliminar (con confirmación). */
export function EventActions({ ev }: { ev: PcEvent }) {
  const { slug } = useOrg()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const title = eventTitle(ev)
  const noun = ev.type === 'match' ? 'partido' : ev.type === 'training' ? 'entreno' : 'actividad'
  // La API no deja borrar un partido con resultado publicado (event_has_result).
  const canDelete = !ev.result_published_at

  const remove = usePcMutation({
    method: 'DELETE', path: `events/${ev.id}`, invalidate: [['events']],
    onSuccess: () => setConfirm(false),
  })

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', close)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', close) }
  }, [open])

  const item = 'flex min-h-11 w-full items-center gap-2 px-4 text-left text-sm font-semibold hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-40'

  return (
    <div ref={ref} className="relative">
      <button type="button" className="grid size-10 place-items-center rounded-xl text-black/60 hover:bg-black/5"
        aria-label={`Opciones de ${title}`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <MoreVertical className="size-5" aria-hidden />
      </button>
      {open && (
        <div role="menu" aria-label={`Opciones de ${title}`} className="absolute right-0 z-20 mt-1 w-56 overflow-hidden rounded-2xl bg-white py-1 text-ink shadow-lg ring-1 ring-black/10">
          <button role="menuitem" type="button" className={item} onClick={() => navigate(`/${slug}/eventos/${ev.id}/editar`)}>
            <Pencil className="size-4" aria-hidden /> Editar
          </button>
          <button role="menuitem" type="button" className={`${item} text-red-700`} disabled={!canDelete}
            title={canDelete ? undefined : 'No se puede eliminar un partido con resultado publicado'}
            onClick={() => { setOpen(false); remove.reset(); setConfirm(true) }}>
            <Trash2 className="size-4" aria-hidden /> Eliminar
          </button>
          {!canDelete && <p className="px-4 pb-2 text-xs text-black/50">Tiene resultado publicado: no se puede eliminar.</p>}
        </div>
      )}
      <ConfirmDialog open={confirm} title={`¿Eliminar este ${noun}?`} confirmLabel="Eliminar" danger busy={remove.isPending}
        onConfirm={() => remove.mutate()} onCancel={() => setConfirm(false)}>
        <strong>{title}</strong> se quitará de la PC y de la App de los padres. Esta acción no se puede deshacer.
        <ErrorAlert error={remove.error} />
      </ConfirmDialog>
    </div>
  )
}
