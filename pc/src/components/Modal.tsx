import { useEffect, type ReactNode } from 'react'
import { X } from 'lucide-react'

/** Hoja inferior en el celular, ventana centrada en la computadora. Escape cierra. */
export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-40 grid place-items-end bg-black/50 sm:place-items-center" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div className="max-h-[90dvh] w-full overflow-y-auto rounded-t-2xl bg-white p-5 sm:max-w-lg sm:rounded-2xl">
        <div className="mb-4 flex items-center justify-between gap-2">
          <h2 id="modal-title" className="text-lg font-bold">{title}</h2>
          <button className="btn-ghost px-2" onClick={onClose} aria-label="Cerrar"><X aria-hidden /></button>
        </div>
        {children}
      </div>
    </div>
  )
}
