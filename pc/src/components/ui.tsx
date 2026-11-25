import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { AlertTriangle, CheckCircle2, Info, Loader2, XCircle } from 'lucide-react'
import { ApiError } from '../lib/api'

export function Spinner({ label = 'Cargando…' }: { label?: string }) {
  return (
    <div role="status" className="flex items-center justify-center gap-2 py-10 text-black/60">
      <Loader2 className="size-5 animate-spin" aria-hidden />
      <span>{label}</span>
    </div>
  )
}

type Tone = 'info' | 'success' | 'warning' | 'error'
const TONES: Record<Tone, { cls: string; Icon: typeof Info }> = {
  info: { cls: 'bg-sky-50 text-sky-900 ring-sky-200', Icon: Info },
  success: { cls: 'bg-emerald-50 text-emerald-900 ring-emerald-200', Icon: CheckCircle2 },
  warning: { cls: 'bg-amber-50 text-amber-900 ring-amber-300', Icon: AlertTriangle },
  error: { cls: 'bg-red-50 text-red-900 ring-red-200', Icon: XCircle },
}

export function Alert({ tone = 'info', children, title }: { tone?: Tone; children: ReactNode; title?: string }) {
  const { cls, Icon } = TONES[tone]
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={`flex gap-3 rounded-xl p-3 ring-1 ${cls}`}>
      <Icon className="mt-0.5 size-5 shrink-0" aria-hidden />
      <div className="text-sm">
        {title && <p className="font-semibold">{title}</p>}
        <div>{children}</div>
      </div>
    </div>
  )
}

/** Muestra `error.message` de la API (o un texto genérico). */
export function ErrorAlert({ error }: { error: unknown }) {
  if (!error) return null
  const msg = error instanceof ApiError ? error.message : 'Ocurrió un error. Intente de nuevo.'
  return <Alert tone="error">{msg}</Alert>
}

export function fieldError(error: unknown, field: string): string | undefined {
  const msg = error instanceof ApiError ? error.fields[field]?.[0] : undefined
  return msg ? humanizeValidation(msg) : undefined
}

// Si la API devuelve la clave sin traducir ("validation.required"), se muestra un texto en español.
const VALIDATION_ES: Record<string, string> = {
  required: 'Este campo es obligatorio.',
  required_if: 'Este campo es obligatorio.',
  required_without: 'Este campo es obligatorio.',
  date: 'La fecha no es válida.',
  after: 'La hora de fin debe ser después del inicio.',
  after_or_equal: 'La fecha no es válida.',
  before: 'La fecha no es válida.',
  email: 'El correo no es válido.',
  integer: 'Debe ser un número.',
  numeric: 'Debe ser un número.',
  min: 'Es demasiado corto o pequeño.',
  max: 'Es demasiado largo o grande.',
  in: 'El valor no es válido.',
  exists: 'No se encontró. Revise el dato.',
  unique: 'Ya existe.',
  confirmed: 'Las contraseñas no coinciden.',
  distinct: 'Hay valores repetidos.',
  regex: 'El formato no es válido.',
  boolean: 'El valor no es válido.',
  array: 'El valor no es válido.',
  string: 'El valor no es válido.',
  present: 'Este campo es obligatorio.',
}

export function humanizeValidation(msg: string): string {
  const m = /^validation\.([a-z_]+)/.exec(msg.trim())
  if (!m) return msg
  return VALIDATION_ES[m[1]] ?? 'Revise este dato.'
}

interface FieldProps {
  label: string
  error?: string
  hint?: string
  children: (props: { id: string; 'aria-invalid': boolean; 'aria-describedby'?: string }) => ReactNode
}

export function Field({ label, error, hint, children }: FieldProps) {
  const id = useId()
  const describedBy = error ? `${id}-err` : hint ? `${id}-hint` : undefined
  return (
    <div>
      <label htmlFor={id} className="label">{label}</label>
      {children({ id, 'aria-invalid': !!error, 'aria-describedby': describedBy })}
      {hint && !error && <p id={`${id}-hint`} className="mt-1 text-xs text-black/60">{hint}</p>}
      {error && <p id={`${id}-err`} className="mt-1 text-sm text-red-700">{error}</p>}
    </div>
  )
}

export function TextField({ label, error, hint, ...rest }: { label: string; error?: string; hint?: string } & InputHTMLAttributes<HTMLInputElement>) {
  return <Field label={label} error={error} hint={hint}>{(p) => <input className="input" {...p} {...rest} />}</Field>
}

export function SelectField({ label, error, hint, children, ...rest }: { label: string; error?: string; hint?: string; children: ReactNode } & SelectHTMLAttributes<HTMLSelectElement>) {
  return <Field label={label} error={error} hint={hint}>{(p) => <select className="input" {...p} {...rest}>{children}</select>}</Field>
}

export function TextAreaField({ label, error, hint, ...rest }: { label: string; error?: string; hint?: string } & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <Field label={label} error={error} hint={hint}>{(p) => <textarea className="input min-h-24 py-2" {...p} {...rest} />}</Field>
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="title text-3xl sm:text-4xl">{title}</h1>
        {subtitle && <p className="mt-1 text-black/60">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-2xl border border-dashed border-black/20 p-6 text-center text-black/60">{children}</p>
}

export function Avatar({ name, url, size = 40 }: { name: string; url?: string | null; size?: number }) {
  const ini = name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('')
  return url ? (
    <img src={url} alt="" width={size} height={size} className="shrink-0 rounded-full object-cover ring-1 ring-black/10" style={{ width: size, height: size }} />
  ) : (
    <span aria-hidden className="grid shrink-0 place-items-center rounded-full bg-org/15 font-bold text-ink" style={{ width: size, height: size, fontSize: size * 0.38 }}>
      {ini}
    </span>
  )
}
