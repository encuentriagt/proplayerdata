import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ApiError } from '../../lib/api'
import { contrast, isHex } from '../../lib/color'
import { applyTheme, themeFor } from '../../lib/branding'
import { useOrg } from '../../lib/org'
import { usePcMutation } from '../../lib/queries'
import type { Branding } from '../../lib/types'
import { OrgLogo } from '../../components/OrgLogo'
import { Alert, ErrorAlert } from '../../components/ui'

type Kind = 'logo' | 'crest' | 'cover'
const KIND_LABEL: Record<Kind, string> = { logo: 'Logo', crest: 'Escudo', cover: 'Portada del login' }

export function AdminBranding() {
  const { branding, slug, brandingEditable } = useOrg()
  const qc = useQueryClient()
  const [colors, setColors] = useState({
    color_primary: branding.colors.primary ?? '#25984D',
    color_secondary: branding.colors.secondary ?? '#D28316',
    color_on_primary: branding.colors.on_primary ?? '#FFFFFF',
  })
  const [ok, setOk] = useState(false)

  const refresh = () => {
    localStorage.removeItem(`ppd.pc.branding.${slug}`)
    void qc.invalidateQueries({ queryKey: ['branding', slug] })
    void qc.invalidateQueries({ queryKey: ['me'] })
  }

  const save = usePcMutation<void, Branding>({
    method: 'PATCH', path: 'branding', body: () => colors,
    onSuccess: (b) => { qc.setQueryData(['branding', slug], b); refresh(); setOk(true) },
  })
  useEffect(() => {
    if (save.error instanceof ApiError && save.error.code === 'branding_locked') void qc.invalidateQueries({ queryKey: ['me'] })
  }, [save.error, qc])

  // branding_editable viene en /auth/me; el 403 branding_locked queda como respaldo por si cambió entretanto.
  const locked = !brandingEditable || (save.error instanceof ApiError && save.error.code === 'branding_locked')
  const ratio = isHex(colors.color_primary) && isHex(colors.color_on_primary) ? contrast(colors.color_primary, colors.color_on_primary) : 0
  const preview = themeFor({ colors: { primary: colors.color_primary, secondary: colors.color_secondary, on_primary: colors.color_on_primary } })

  return (
    <>
      <h2 className="title mb-3 text-2xl">Marca</h2>
      {locked ? (
        <Alert tone="info">La marca de su organización la administra ppd. Si necesita cambios, comuníquese con soporte@ppdguate.com.</Alert>
      ) : (
        <p className="mb-4 text-sm text-black/60">Su logo y colores aparecen en la Plataforma Coach y en la App de los padres.</p>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card space-y-4 p-4" aria-labelledby="colors-h">
          <h3 id="colors-h" className="font-bold">Colores</h3>
          {ok && <Alert tone="success">Colores guardados.</Alert>}
          {!locked && <ErrorAlert error={save.error} />}
          {([['color_primary', 'Color primario'], ['color_secondary', 'Color secundario'], ['color_on_primary', 'Texto sobre el primario']] as const).map(([k, label]) => (
            <label key={k} className="flex items-center gap-3">
              <input type="color" disabled={locked} className="h-11 w-14 cursor-pointer rounded-lg border border-black/20 disabled:cursor-not-allowed" value={colors[k]}
                onChange={(e) => { setOk(false); setColors((c) => ({ ...c, [k]: e.target.value.toUpperCase() })) }} />
              <span className="flex-1 font-semibold">{label}</span>
              <code className="text-sm text-black/60">{colors[k]}</code>
            </label>
          ))}
          <p className={`text-sm ${ratio >= 4.5 ? 'text-emerald-800' : 'text-amber-900'}`}>
            Contraste del texto sobre el primario: {ratio.toFixed(1)}:1 {ratio >= 4.5 ? '(cumple AA)' : '(bajo: se usará blanco o negro automáticamente)'}
          </p>
          {!locked && <div className="flex gap-2">
            <button className="btn-secondary" onClick={() => applyTheme({ colors: { primary: colors.color_primary, secondary: colors.color_secondary, on_primary: colors.color_on_primary } })}>Vista previa</button>
            <button className="btn-primary" disabled={save.isPending || locked} onClick={() => { setOk(false); save.mutate() }}>{save.isPending ? 'Guardando…' : 'Guarde los colores'}</button>
          </div>}
          <div className="rounded-xl p-4" style={{ background: preview.primary, color: preview.onPrimary }}>
            <p className="font-semibold">{branding.name}</p>
            <p className="text-sm">Así se ve el encabezado.</p>
          </div>
        </section>

        <section className="card space-y-4 p-4" aria-labelledby="img-h">
          <h3 id="img-h" className="font-bold">Imágenes</h3>
          <p className="text-sm text-black/60">PNG, JPG o WEBP de hasta 2 MB. No se aceptan SVG.</p>
          {(['logo', 'crest', 'cover'] as Kind[]).map((k) => <ImageUpload key={k} kind={k} current={branding[`${k}_url`]} disabled={locked} onDone={refresh} />)}
          <div className="flex items-center gap-3 rounded-xl bg-black/5 p-3"><OrgLogo org={branding} size={48} /><span className="text-sm">Logo actual en el menú</span></div>
        </section>
      </div>
    </>
  )
}

function ImageUpload({ kind, current, disabled, onDone }: { kind: Kind; current: string | null; disabled: boolean; onDone: () => void }) {
  const input = useRef<HTMLInputElement>(null)
  const [err, setErr] = useState<string>()
  const up = usePcMutation<File, { url: string }>({
    method: 'POST', path: `branding/${kind}`,
    body: (file) => { const fd = new FormData(); fd.append('image', file); return fd },
    onSuccess: onDone,
  })
  const onFile = (f?: File) => {
    setErr(undefined)
    if (!f) return
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(f.type)) return setErr('Use PNG, JPG o WEBP.')
    if (f.size > 2 * 1024 * 1024) return setErr('La imagen supera 2 MB.')
    up.mutate(f)
  }
  const shown = up.data?.url ?? current
  return (
    <div className="flex items-center gap-3">
      <div className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-xl bg-black/5">
        {shown ? <img src={shown} alt={KIND_LABEL[kind]} className="size-full object-contain" /> : <span className="text-xs text-black/40">Sin imagen</span>}
      </div>
      <div className="flex-1">
        <p className="font-semibold">{KIND_LABEL[kind]}</p>
        {(err || up.error) && <p className="text-sm text-red-700">{err ?? (up.error as Error).message}</p>}
      </div>
      <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" aria-label={`Elegir ${KIND_LABEL[kind]}`}
        onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = '' }} />
      <button className="btn-secondary min-h-9 text-sm" disabled={disabled || up.isPending} onClick={() => input.current?.click()}>
        {up.isPending ? 'Subiendo…' : shown ? 'Cambiar' : 'Subir'}
      </button>
    </div>
  )
}
