import { useEffect, useRef, type ReactNode } from 'react'

interface Props {
  open: boolean
  title: string
  children?: ReactNode
  confirmLabel: string
  cancelLabel?: string
  danger?: boolean
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}

/** Confirmación accesible con <dialog> (sin alert/confirm del navegador). */
export function ConfirmDialog({ open, title, children, confirmLabel, cancelLabel = 'Cancelar', danger, busy, onConfirm, onCancel }: Props) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal?.()
    if (!open && d.open) d.close()
  }, [open])

  return (
    <dialog ref={ref} onCancel={(e) => { e.preventDefault(); onCancel() }} aria-labelledby="confirm-title"
      className="m-auto w-[min(26rem,calc(100vw-2rem))] rounded-2xl p-0 backdrop:bg-black/50">
      {open && (
        <div className="p-5">
          <h2 id="confirm-title" className="text-lg font-bold">{title}</h2>
          {children && <div className="mt-2 text-black/70">{children}</div>}
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={onCancel} disabled={busy}>{cancelLabel}</button>
            <button type="button" className={danger ? 'btn-danger' : 'btn-primary'} onClick={onConfirm} disabled={busy} autoFocus>
              {busy ? 'Enviando…' : confirmLabel}
            </button>
          </div>
        </div>
      )}
    </dialog>
  )
}
