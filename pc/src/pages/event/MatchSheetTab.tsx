import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, Minus, Plus, Trash2 } from 'lucide-react'
import { useOrg } from '../../lib/org'
import { usePcMutation, useRoster } from '../../lib/queries'
import {
  clearDraft, emptyRow, loadDraft, saveDraft, scoredByPlayers, sheetFromEvent, statCount, tapMinus, tapPlus, toPayload,
  type LineupRow, type SheetState,
} from '../../lib/matchSheet'
import { fmt } from '../../lib/dates'
import type { EventDetail, PcEvent, RosterEntry } from '../../lib/types'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { Alert, Avatar, Empty, ErrorAlert, Spinner } from '../../components/ui'

export function MatchSheetTab({ event }: { event: EventDetail }) {
  const roster = useRoster(event.team_id)
  if (roster.isLoading) return <Spinner />
  if (roster.isError) return <ErrorAlert error={roster.error} />
  return <Sheet event={event} roster={roster.data ?? []} sport={event.sport} />
}

function Sheet({ event, roster, sport }: { event: EventDetail; roster: RosterEntry[]; sport: EventDetail['sport'] }) {
  const { slug } = useOrg()
  const serverState = useMemo(() => sheetFromEvent(event, roster), [event, roster])
  const [draft] = useState(() => loadDraft(slug, event.id))
  const [state, setState] = useState<SheetState>(serverState)
  const [draftOffer, setDraftOffer] = useState(!!draft)
  const [result, setResult] = useState<{ published: boolean; correction: boolean; warnings: string[] } | null>(null)
  const [confirmPublish, setConfirmPublish] = useState(false)
  const [open, setOpen] = useState<number | null>(null)
  const touched = useRef(false)

  // Guardar en el navegador mientras se edita (por si se pierde la señal).
  useEffect(() => {
    if (touched.current) saveDraft(slug, event.id, state)
  }, [state, slug, event.id])

  const update = (fn: (s: SheetState) => SheetState) => {
    touched.current = true
    setResult(null)
    setDraftOffer(false)
    setState(fn)
  }

  const published = !!event.result_published_at
  const save = usePcMutation<boolean, PcEvent & { warnings: string[] }>({
    method: 'PUT', path: `events/${event.id}/match-sheet`, idempotent: true,
    body: (publish) => toPayload(state, publish),
    invalidate: [['event', event.id], ['events']],
    onSuccess: (r, publish) => {
      clearDraft(slug, event.id)
      touched.current = false
      setConfirmPublish(false)
      setResult({ published: publish, correction: published, warnings: r.warnings ?? [] })
    },
  })

  const rosterById = new Map(roster.map((r) => [r.id, r]))
  // Jugadores de la ficha: plantilla activa + quien ya esté en la alineación aunque ya no esté activo.
  const players = roster.filter((r) => r.active || state.lineup[r.id]?.played)
  const statTypes = sport.stat_types
  const suggested = scoredByPlayers(state, statTypes)
  const playing = players.filter((p) => state.lineup[p.id]?.played)

  if (!players.length) return <Empty>El equipo no tiene jugadores activos.</Empty>

  const row = (id: number): LineupRow => state.lineup[id] ?? emptyRow(rosterById.get(id))
  const setRow = (id: number, patch: Partial<LineupRow>) =>
    update((s) => ({ ...s, lineup: { ...s.lineup, [id]: { ...row(id), ...patch } } }))

  return (
    <div className="space-y-4 pb-28">
      {draftOffer && draft && (
        <Alert tone="warning" title="Hay un borrador sin enviar en este dispositivo">
          Guardado el {fmt(draft.savedAt, "d 'de' MMM, HH:mm")}.
          <div className="mt-2 flex gap-2">
            <button className="btn-primary min-h-9 text-sm" onClick={() => { touched.current = true; setState(draft.state); setDraftOffer(false) }}>Recuperar borrador</button>
            <button className="btn-secondary min-h-9 text-sm" onClick={() => { clearDraft(slug, event.id); setDraftOffer(false) }}>Descartar</button>
          </div>
        </Alert>
      )}
      {result && (
        <Alert tone="success">
          {result.published ? (result.correction ? 'Ficha corregida y publicada.' : 'Resultado publicado. Se avisó a los padres.') : 'Borrador guardado.'}
        </Alert>
      )}
      {result?.warnings.map((w) => <Alert key={w} tone="warning">{w}</Alert>)}
      <ErrorAlert error={save.error} />
      {published && !result && (
        <Alert tone="info">El resultado ya está publicado. Cada corrección queda publicada; si cambia el marcador, se avisará a los padres.</Alert>
      )}

      {/* Marcador */}
      <section aria-labelledby="score-h" className="card p-4">
        <h2 id="score-h" className="title mb-3 text-xl">Marcador</h2>
        <div className="flex items-start justify-center gap-1 sm:gap-8">
          <ScoreInput label="Nosotros" value={state.score_us} onChange={(v) => update((s) => ({ ...s, score_us: v }))} />
          <span className="mt-8 font-display text-3xl font-extrabold italic text-black/30" aria-hidden>–</span>
          <ScoreInput label={event.opponent_name || 'Rival'} value={state.score_them} onChange={(v) => update((s) => ({ ...s, score_them: v }))} />
        </div>
        {state.stats.length > 0 && suggested !== state.score_us && (
          <p className="mt-3 text-center text-sm text-amber-900">
            Sus jugadores suman {suggested}.{' '}
            <button className="font-semibold underline" onClick={() => update((s) => ({ ...s, score_us: suggested }))}>Usar {suggested}</button>
          </p>
        )}
      </section>

      {/* Jugadores: alineación + estadísticas */}
      <section aria-labelledby="players-h" className="space-y-2">
        <div className="flex items-end justify-between">
          <h2 id="players-h" className="title text-xl">Jugadores</h2>
          <p className="text-sm text-black/60">{playing.length} jugaron · {playing.filter((p) => row(p.id).is_starter).length} titulares</p>
        </div>
        <ul className="space-y-2">
          {players.map((p) => {
            const r = row(p.id)
            const expanded = open === p.id
            const total = statTypes.reduce((n, t) => n + statCount(state, p.id, t.code), 0)
            return (
              <li key={p.id} className={`card overflow-hidden ${r.played ? '' : 'opacity-70'}`}>
                <div className="flex items-center gap-3 p-3">
                  <input type="checkbox" className="size-6 shrink-0 accent-[var(--org-accent)]" checked={r.played}
                    aria-label={`${p.full_name} jugó`} onChange={(e) => setRow(p.id, { played: e.target.checked, ...(e.target.checked ? {} : { is_starter: false }) })} />
                  <Avatar name={p.full_name} url={p.photo_url} size={36} />
                  <button className="flex min-w-0 flex-1 items-center gap-2 text-left" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : p.id)}>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">
                        {r.jersey_number !== null && <span className="text-black/50">#{r.jersey_number} </span>}{p.full_name}
                      </span>
                      <span className="text-xs text-black/60">
                        {r.played ? (r.is_starter ? 'Titular' : 'Suplente') : 'No jugó'}
                        {r.minutes_played !== null && ` · ${r.minutes_played} min`}
                        {total > 0 && ` · ${statTypes.filter((t) => statCount(state, p.id, t.code)).map((t) => `${t.name} ${statCount(state, p.id, t.code)}`).join(', ')}`}
                      </span>
                    </span>
                    <ChevronDown className={`size-5 shrink-0 transition ${expanded ? 'rotate-180' : ''}`} aria-hidden />
                  </button>
                </div>

                {expanded && (
                  <div className="space-y-3 border-t border-black/5 bg-black/[0.02] p-3">
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      <label className="flex min-h-11 items-center gap-2 text-sm font-semibold">
                        <input type="checkbox" className="size-5 accent-[var(--org-accent)]" checked={r.is_starter}
                          onChange={(e) => setRow(p.id, { is_starter: e.target.checked, played: e.target.checked || r.played })} />
                        Titular
                      </label>
                      <label className="text-sm">
                        <span className="label">Posición</span>
                        <select className="input" value={r.sport_position_id ?? ''} onChange={(e) => setRow(p.id, { sport_position_id: e.target.value ? Number(e.target.value) : null })}>
                          <option value="">—</option>
                          {sport.positions.map((pos) => <option key={pos.id} value={pos.id}>{pos.name}</option>)}
                        </select>
                      </label>
                      <NumberInput label="Dorsal" value={r.jersey_number} max={999} onChange={(v) => setRow(p.id, { jersey_number: v })} />
                      <NumberInput label="Minutos" value={r.minutes_played} max={600} onChange={(v) => setRow(p.id, { minutes_played: v, played: true })} />
                    </div>
                  </div>
                )}

                {/* Estadísticas siempre visibles: + / − por cada tipo del deporte */}
                {statTypes.length > 0 && (
                  <div className="flex flex-wrap gap-2 border-t border-black/5 p-2">
                    {statTypes.map((t) => {
                      const n = statCount(state, p.id, t.code)
                      return (
                        <div key={t.code} className={`flex items-center rounded-xl ring-1 ${n ? 'bg-org/10 ring-org/40' : 'bg-white ring-black/10'}`}>
                          <button type="button" className="grid size-10 place-items-center rounded-l-xl hover:bg-black/5 disabled:opacity-30" disabled={!n}
                            aria-label={`Quitar ${t.name} a ${p.full_name}`} onClick={() => update((s) => tapMinus(s, p.id, t.code))}>
                            <Minus className="size-4" aria-hidden />
                          </button>
                          <span className="min-w-16 px-1 text-center text-xs font-semibold leading-tight">
                            {t.name}<span className="block text-base font-bold" aria-live="polite">{n}</span>
                          </span>
                          <button type="button" className="grid size-10 place-items-center rounded-r-xl hover:bg-black/5"
                            aria-label={`Agregar ${t.name} a ${p.full_name}`} onClick={() => update((s) => tapPlus(s, p.id, t.code))}>
                            <Plus className="size-4" aria-hidden />
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      </section>

      {/* Cambios (opcional) */}
      <section aria-labelledby="subs-h" className="card p-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 id="subs-h" className="title text-xl">Cambios <span className="text-sm font-normal normal-case not-italic text-black/50">(opcional)</span></h2>
          <button className="btn-ghost text-sm" onClick={() => update((s) => ({ ...s, subs: [...s.subs, { in_id: null, out_id: null, minute: null }] }))}>
            <Plus className="size-4" aria-hidden /> Agregar cambio
          </button>
        </div>
        {state.subs.length === 0 ? <p className="text-sm text-black/60">Sin cambios registrados.</p> : (
          <ul className="space-y-2">
            {state.subs.map((sub, i) => {
              const setSub = (patch: Partial<typeof sub>) => update((s) => ({ ...s, subs: s.subs.map((x, j) => (j === i ? { ...x, ...patch } : x)) }))
              return (
                <li key={i} className="grid grid-cols-[1fr_1fr_5rem_auto] items-end gap-2">
                  <PlayerSelect label="Entra" players={players} value={sub.in_id} onChange={(v) => setSub({ in_id: v })} />
                  <PlayerSelect label="Sale" players={players} value={sub.out_id} onChange={(v) => setSub({ out_id: v })} />
                  <NumberInput label="Min." value={sub.minute} max={600} onChange={(v) => setSub({ minute: v })} />
                  <button className="btn-ghost px-2 text-red-700" aria-label="Quitar cambio" onClick={() => update((s) => ({ ...s, subs: s.subs.filter((_, j) => j !== i) }))}>
                    <Trash2 className="size-5" aria-hidden />
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {/* Acciones fijas abajo para el celular */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-black/10 bg-white/95 p-3 backdrop-blur lg:left-64">
        <div className="mx-auto flex max-w-6xl gap-2">
          {!published && (
            <button className="btn-secondary flex-1 sm:flex-none" disabled={save.isPending} onClick={() => save.mutate(false)}>
              {save.isPending && !confirmPublish ? 'Guardando…' : 'Guardar borrador'}
            </button>
          )}
          <button className="btn-primary flex-1 sm:flex-none" disabled={save.isPending} onClick={() => setConfirmPublish(true)}>
            {published ? 'Guardar corrección' : 'Publicar resultado'}
          </button>
        </div>
      </div>

      <ConfirmDialog open={confirmPublish} title={published ? '¿Guardar la corrección?' : '¿Publicar el resultado?'}
        confirmLabel={published ? 'Guardar' : 'Publicar'} busy={save.isPending}
        onConfirm={() => save.mutate(true)} onCancel={() => setConfirmPublish(false)}>
        {published
          ? 'Si cambió el marcador, se avisará a los padres.'
          : 'Se enviará el resultado a los padres. ¿Desea continuar?'}
        <p className="mt-2 font-display text-3xl font-extrabold italic text-ink">{state.score_us}–{state.score_them}</p>
      </ConfirmDialog>
    </div>
  )
}

function ScoreInput({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  const id = `score-${label}`
  return (
    <div className="flex flex-col items-center">
      <label htmlFor={id} className="mb-1 max-w-32 truncate text-sm font-semibold">{label}</label>
      <div className="flex items-center gap-0.5 sm:gap-1">
        <button type="button" className="grid size-10 sm:size-11 place-items-center rounded-xl bg-black/5 disabled:opacity-30" disabled={value <= 0}
          aria-label={`Restar a ${label}`} onClick={() => onChange(Math.max(0, value - 1))}><Minus className="size-5" aria-hidden /></button>
        <input id={id} type="number" inputMode="numeric" min={0} max={999} value={value}
          onChange={(e) => onChange(Math.min(999, Math.max(0, Number(e.target.value) || 0)))}
          className="h-12 w-14 rounded-xl border border-black/20 text-center font-display text-3xl sm:h-auto sm:w-20 sm:text-4xl font-extrabold italic" />
        <button type="button" className="grid size-10 sm:size-11 place-items-center rounded-xl bg-black/5"
          aria-label={`Sumar a ${label}`} onClick={() => onChange(Math.min(999, value + 1))}><Plus className="size-5" aria-hidden /></button>
      </div>
    </div>
  )
}

function NumberInput({ label, value, max, onChange }: { label: string; value: number | null; max: number; onChange: (v: number | null) => void }) {
  return (
    <label className="text-sm">
      <span className="label">{label}</span>
      <input type="number" inputMode="numeric" min={0} max={max} className="input" value={value ?? ''}
        onChange={(e) => onChange(e.target.value === '' ? null : Math.min(max, Math.max(0, Number(e.target.value))))} />
    </label>
  )
}

function PlayerSelect({ label, players, value, onChange }: { label: string; players: RosterEntry[]; value: number | null; onChange: (v: number | null) => void }) {
  return (
    <label className="text-sm">
      <span className="label">{label}</span>
      <select className="input" value={value ?? ''} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}>
        <option value="">—</option>
        {players.map((p) => <option key={p.id} value={p.id}>{p.jersey_number !== null ? `#${p.jersey_number} ` : ''}{p.full_name}</option>)}
      </select>
    </label>
  )
}
