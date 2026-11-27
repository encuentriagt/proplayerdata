import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, Minus, Plus, Trash2 } from 'lucide-react'
import { useOrg } from '../../lib/org'
import { usePcMutation, useRoster } from '../../lib/queries'
import {
  CONCEDED, clearDraft, emptyRow, goalkeeperFor, isGoalkeeper, loadDraft, rivalScore, saveDraft, sheetFromEvent, statCount, tapMinus, tapPlus, toPayload, visibleStatTypes,
  type LineupRow, type SheetState,
} from '../../lib/matchSheet'
import { fmt } from '../../lib/dates'
import type { EventDetail, PcEvent, RosterEntry } from '../../lib/types'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { Alert, Empty, ErrorAlert, Spinner } from '../../components/ui'

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
  // Todas cuentan para el marcador; en pantalla solo las visibles (sin asistencia, autogol ni atajada).
  const allStatTypes = sport.stat_types
  const statTypes = visibleStatTypes(allStatTypes).filter((t) => t.code !== CONCEDED)
  // "Gol en contra" solo existe si el catálogo lo trae, y solo se muestra en el portero.
  const conceded = allStatTypes.find((t) => t.code === CONCEDED)
  const isGk = (id: number) => isGoalkeeper(row(id).sport_position_id, sport.positions)
  const statsFor = (id: number) => (conceded && isGk(id) ? [...statTypes, conceded] : statTypes)
  const gkMissing = !!conceded && goalkeeperFor(state, sport.positions) === null
  const plus = (id: number, code: string) => update((s) => tapPlus(s, id, code, allStatTypes))
  const minus = (id: number, code: string) => update((s) => tapMinus(s, id, code, allStatTypes))
  const playing = players.filter((p) => state.lineup[p.id]?.played)

  if (!players.length) return <Empty>El equipo no tiene jugadores activos.</Empty>

  const row = (id: number): LineupRow => state.lineup[id] ?? emptyRow(rosterById.get(id))
  const setRow = (id: number, patch: Partial<LineupRow>) =>
    update((s) => ({ ...s, lineup: { ...s.lineup, [id]: { ...row(id), ...patch } } }))

  return (
    <div className="flex flex-col gap-4 pb-28 lg:pb-0">
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
      <section aria-labelledby="score-h" className="card px-4 py-5">
        <h2 id="score-h" className="sr-only">Marcador</h2>
        <div className="flex items-start justify-center gap-2 sm:gap-10">
          <ScoreAuto label="Nosotros" value={state.score_us} />
          <span className="num mt-10 text-3xl text-muted" aria-hidden>–</span>
          <ScoreInput label={event.opponent_name || 'Rival'} value={state.score_them}
            onStep={(d) => update((s) => rivalScore(s, d, allStatTypes, sport.positions))}
            onChange={(v) => update((s) => ({ ...s, score_them: v }))} />
        </div>
        <p className="mt-3 text-center text-xs text-muted">
          El marcador de su equipo se suma solo con los goles que marque a sus jugadores.
          {conceded && ' Cada gol del rival se le suma como gol en contra a su portero.'}
        </p>
        {gkMissing && state.score_them > 0 && (
          <p className="mt-1 text-center text-sm text-warn-ink">Marque quién jugó de Portero para sumarle los goles en contra.</p>
        )}
      </section>

      {/* Jugadores: alineación + estadísticas */}
      <section aria-labelledby="players-h" className="space-y-2">
        <div className="flex items-end justify-between">
          <h2 id="players-h" className="title text-2xl">Jugadores</h2>
          <p className="text-sm text-muted">{playing.length} jugaron · {playing.filter((p) => row(p.id).is_starter).length} titulares</p>
        </div>
        {/* Celular: filas que se expanden (diseño) */}
        <ul className="space-y-2 lg:hidden">
          {players.map((p) => {
            const r = row(p.id)
            const expanded = open === p.id
            const summary = [
              r.played ? (r.is_starter ? 'Titular' : 'Suplente') : 'No jugó',
              r.minutes_played !== null ? `${r.minutes_played}'` : null,
              ...statsFor(p.id).filter((t) => statCount(state, p.id, t.code)).map((t) => `${statCount(state, p.id, t.code)} ${t.name.toLowerCase()}`),
            ].filter(Boolean).join(' · ')
            return (
              <li key={p.id} className={`card overflow-hidden ${r.played ? '' : 'opacity-70'}`}>
                <div className="flex items-center gap-3 px-3 py-2.5">
                  <input type="checkbox" className="size-6 shrink-0 accent-[var(--org-primary)]" checked={r.played}
                    aria-label={`${p.full_name} jugó`} onChange={(e) => setRow(p.id, { played: e.target.checked, ...(e.target.checked ? {} : { is_starter: false }) })} />
                  <span className="num w-7 shrink-0 text-center text-2xl">{r.jersey_number ?? '–'}</span>
                  <button className="flex min-w-0 flex-1 items-center gap-2 text-left" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : p.id)}>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{p.full_name}</span>
                      <span className="block truncate text-xs text-muted">{summary}</span>
                    </span>
                    <ChevronDown className={`size-5 shrink-0 transition ${expanded ? 'rotate-180' : ''}`} aria-hidden />
                  </button>
                </div>

                {expanded && (
                  <div className="grid grid-cols-2 gap-3 border-t border-line bg-paper/60 p-3">
                    <div className="col-span-2">
                      <StarterToggle name={p.full_name} starter={r.is_starter} onChange={(v) => setRow(p.id, { is_starter: v, played: true })} />
                    </div>
                    <label className="col-span-2 text-sm">
                      <span className="label">Posición</span>
                      <select className="input" value={r.sport_position_id ?? ''} onChange={(e) => setRow(p.id, { sport_position_id: e.target.value ? Number(e.target.value) : null })}>
                        <option value="">—</option>
                        {sport.positions.map((pos) => <option key={pos.id} value={pos.id}>{pos.name}</option>)}
                      </select>
                    </label>
                    <NumberInput label="Dorsal" value={r.jersey_number} max={999} onChange={(v) => setRow(p.id, { jersey_number: v })} />
                    <NumberInput label="Minutos" value={r.minutes_played} max={600} onChange={(v) => setRow(p.id, { minutes_played: v, played: true })} />
                  </div>
                )}

                {/* Estadísticas a la vista: en la cancha se anota sin abrir al jugador */}
                {statsFor(p.id).length > 0 && (
                  <div className="flex flex-wrap gap-x-4 gap-y-2 border-t border-line px-3 py-2.5">
                    {statsFor(p.id).map((t) => (
                      <StatStepper key={t.code} label={t.name} player={p.full_name} value={statCount(state, p.id, t.code)}
                        onMinus={() => minus(p.id, t.code)} onPlus={() => plus(p.id, t.code)} />
                    ))}
                  </div>
                )}
              </li>
            )
          })}
        </ul>

        {/* Escritorio: tabla (diseño) */}
        <div className="card hidden overflow-x-auto lg:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left">
                <th className="caps px-3 py-3 font-semibold">Jugó</th>
                <th className="caps px-1 py-3 font-semibold">#</th>
                <th className="caps px-3 py-3 font-semibold">Jugador · {playing.length} jugaron</th>
                <th className="caps px-3 py-3 text-center font-semibold">Titular</th>
                <th className="caps px-3 py-3 text-center font-semibold">Minutos</th>
                {statTypes.map((t) => <th key={t.code} className="caps px-2 py-3 text-center font-semibold">{t.name}</th>)}
                {conceded && <th className="caps px-2 py-3 text-center font-semibold">{conceded.name} <span className="normal-case tracking-normal">(portero)</span></th>}
              </tr>
            </thead>
            <tbody>
              {players.map((p) => {
                const r = row(p.id)
                return (
                  <tr key={p.id} className={`border-b border-line last:border-0 ${r.played ? '' : 'opacity-60'}`}>
                    <td className="px-3 py-2">
                      <input type="checkbox" className="size-5 accent-[var(--org-primary)]" checked={r.played}
                        aria-label={`${p.full_name} jugó`} onChange={(e) => setRow(p.id, { played: e.target.checked, ...(e.target.checked ? {} : { is_starter: false }) })} />
                    </td>
                    <td className="px-1 py-2"><span className="num text-xl">{r.jersey_number ?? '–'}</span></td>
                    <td className="px-3 py-2">
                      <p className="font-semibold">{p.full_name}</p>
                      <select className="-ml-1 bg-transparent text-xs text-muted focus:outline-none" aria-label={`Posición de ${p.full_name}`}
                        value={r.sport_position_id ?? ''} onChange={(e) => setRow(p.id, { sport_position_id: e.target.value ? Number(e.target.value) : null })}>
                        <option value="">Sin posición</option>
                        {sport.positions.map((pos) => <option key={pos.id} value={pos.id}>{pos.name}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <StarterToggle name={p.full_name} starter={r.is_starter} onChange={(v) => setRow(p.id, { is_starter: v, played: true })} compact />
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-center gap-1.5">
                        <RoundButton kind="minus" label={`Restar minutos a ${p.full_name}`} disabled={!r.minutes_played}
                          onClick={() => setRow(p.id, { minutes_played: Math.max(0, (r.minutes_played ?? 0) - 5) })} />
                        <span className="num w-8 text-center text-xl">{r.minutes_played ?? 0}</span>
                        <RoundButton kind="plus" label={`Sumar minutos a ${p.full_name}`}
                          onClick={() => setRow(p.id, { minutes_played: Math.min(600, (r.minutes_played ?? 0) + 5), played: true })} />
                      </div>
                    </td>
                    {statTypes.map((t) => (
                      <td key={t.code} className="px-2 py-2">
                        <StatStepper label={t.name} player={p.full_name} value={statCount(state, p.id, t.code)} hideLabel
                          onMinus={() => minus(p.id, t.code)} onPlus={() => plus(p.id, t.code)} />
                      </td>
                    ))}
                    {conceded && (
                      <td className="px-2 py-2 text-center">
                        {isGk(p.id) ? (
                          <StatStepper label={conceded.name} player={p.full_name} value={statCount(state, p.id, CONCEDED)} hideLabel
                            onMinus={() => minus(p.id, CONCEDED)} onPlus={() => plus(p.id, CONCEDED)} />
                        ) : <span className="text-muted" aria-hidden>—</span>}
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
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
      {/* Celular: barra fija abajo. Escritorio: arriba a la derecha (diseño). */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/95 p-3 backdrop-blur lg:static lg:order-first lg:border-0 lg:bg-transparent lg:p-0">
        <div className="mx-auto flex max-w-6xl gap-2 lg:justify-end">
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

/** Marcador de nuestro equipo: solo lectura, se calcula con los goles de los jugadores. */
function ScoreAuto({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col items-center">
      <span className="caps mb-2 max-w-36 truncate">{label}</span>
      <output aria-label={`Marcador de ${label}`} aria-live="polite" className="num grid h-16 min-w-14 place-items-center text-6xl sm:min-w-20">{value}</output>
    </div>
  )
}

function ScoreInput({ label, value, onChange, onStep, primary = false }: { label: string; value: number; onChange: (v: number) => void; onStep: (d: 1 | -1) => void; primary?: boolean }) {
  const id = `score-${label}`
  return (
    <div className="flex flex-col items-center">
      <label htmlFor={id} className="caps mb-2 max-w-36 truncate">{label}</label>
      <div className="flex items-center gap-2 sm:gap-3">
        <RoundButton kind="minus" label={`Restar a ${label}`} disabled={value <= 0} onClick={() => onStep(-1)} size="lg" />
        <input id={id} type="number" inputMode="numeric" min={0} max={999} value={value}
          onChange={(e) => onChange(Math.min(999, Math.max(0, Number(e.target.value) || 0)))}
          className="num h-16 w-14 bg-transparent text-center text-6xl focus:outline-none sm:w-20" />
        <RoundButton kind="plus" label={`Sumar a ${label}`} filled={primary} onClick={() => onStep(1)} size="lg" />
      </div>
    </div>
  )
}

/** Botón redondo − / + del diseño: − con borde; + relleno con el color del colegio (o con borde). */
function RoundButton({ kind, label, onClick, disabled, filled = true, size = 'md' }: { kind: 'plus' | 'minus'; label: string; onClick: () => void; disabled?: boolean; filled?: boolean; size?: 'md' | 'lg' }) {
  const dim = size === 'lg' ? 'size-11' : 'size-8'
  const Icon = kind === 'plus' ? Plus : Minus
  const look = kind === 'plus' && filled ? 'bg-org text-on-org hover:brightness-110' : 'border border-line bg-surface text-ink hover:bg-black/5'
  return (
    <button type="button" aria-label={label} disabled={disabled} onClick={onClick}
      className={`grid ${dim} shrink-0 place-items-center rounded-full disabled:opacity-35 ${look}`}>
      <Icon className={size === 'lg' ? 'size-5' : 'size-4'} aria-hidden />
    </button>
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

/** Estadística: − número + (diseño). Las etiquetas accesibles se mantienen ("Agregar Gol a Ana López"). */
function StatStepper({ label, player, value, onMinus, onPlus, hideLabel = false }: { label: string; player: string; value: number; onMinus: () => void; onPlus: () => void; hideLabel?: boolean }) {
  return (
    <div className="flex items-center justify-center gap-1.5">
      {!hideLabel && <span className="mr-0.5 text-xs font-semibold text-muted">{label}</span>}
      <RoundButton kind="minus" label={`Quitar ${label} a ${player}`} disabled={!value} onClick={onMinus} />
      <span className="num w-6 text-center text-xl" aria-live="polite">{value}</span>
      <RoundButton kind="plus" label={`Agregar ${label} a ${player}`} onClick={onPlus} />
    </div>
  )
}

/** Titular / Suplente segmentado (diseño "Tit. | Sup."). */
function StarterToggle({ name, starter, onChange, compact = false }: { name: string; starter: boolean; onChange: (v: boolean) => void; compact?: boolean }) {
  const opts: [boolean, string][] = [[true, compact ? 'Tit.' : 'Titular'], [false, compact ? 'Sup.' : 'Suplente']]
  return (
    <div role="group" aria-label={`Titular o suplente: ${name}`} className="inline-flex rounded-[10px] bg-[#e4e2e1] p-0.5">
      {opts.map(([v, t]) => (
        <button key={t} type="button" aria-pressed={starter === v} onClick={() => onChange(v)}
          className={`min-h-9 rounded-[8px] px-3 text-sm font-semibold ${starter === v ? 'bg-surface text-ink shadow-sm' : 'text-muted'}`}>
          {t}
        </button>
      ))}
    </div>
  )
}
