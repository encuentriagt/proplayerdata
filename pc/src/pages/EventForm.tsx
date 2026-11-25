import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Users } from 'lucide-react'
import { ApiError, newIdempotencyKey, request, requestIdempotent } from '../lib/api'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { addHours, format, parseISO } from 'date-fns'
import { fromInputValue, toInputValue } from '../lib/dates'
import { EVENT_TYPE } from '../lib/labels'
import { pcPath, useOrg } from '../lib/org'
import { useEvent, usePcMutation, useRoster, useTeams } from '../lib/queries'
import { useSport } from '../lib/sport'
import type { EventType, HomeAway, PcEvent } from '../lib/types'
import { DatePicker, TimePicker } from '../components/DateTimeFields'
import { Avatar, ErrorAlert, PageHeader, SelectField, Spinner, TextAreaField, TextField, fieldError } from '../components/ui'

interface FormState {
  team_id: string
  type: EventType
  starts_at: string
  ends_at: string
  title: string
  location: string
  opponent_name: string
  home_away: HomeAway | ''
  notes: string
}

export function EventFormPage() {
  const { id } = useParams()
  const editing = !!id
  const { slug } = useOrg()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const teams = useTeams()
  const sport = useSport()
  const teamOptions = editing ? teams.data ?? [] : sport.teams
  // Si se llega con ?equipo= de otro deporte (p. ej. desde el detalle de un equipo), se cambia a ese deporte.
  const paramTeam = teams.data?.find((t) => String(t.id) === params.get('equipo'))
  useEffect(() => {
    if (!editing && paramTeam && sport.selected && paramTeam.sport.id !== sport.selected.id) sport.select(paramTeam.sport.id)
  }, [editing, paramTeam, sport])
  const existing = useEvent(editing ? Number(id) : undefined)

  // Desde Partidos o Entrenos llega ?tipo=: el formulario es solo de ese tipo. Al editar, el tipo tampoco cambia.
  // El selector de tipo solo aparece en "Nueva actividad" del Calendario (allí se crean las de tipo "Otro").
  const tipoParam = params.get('tipo')
  const presetType = tipoParam && tipoParam in EVENT_TYPE ? (tipoParam as EventType) : null
  const showTypePicker = !editing && !presetType

  const [f, setF] = useState<FormState>(() => ({
    team_id: params.get('equipo') ?? '',
    type: presetType ?? 'match',
    starts_at: params.get('fecha') ? `${params.get('fecha')}T16:00` : '',
    ends_at: '',
    title: '',
    location: '',
    opponent_name: '',
    home_away: '',
    notes: '',
  }))

  useEffect(() => {
    const e = existing.data
    if (!e) return
    setF({
      team_id: String(e.team_id), type: e.type, starts_at: toInputValue(e.starts_at), ends_at: toInputValue(e.ends_at),
      title: e.title ?? '', location: e.location ?? '', opponent_name: e.opponent_name ?? '', home_away: e.home_away ?? '', notes: e.notes ?? '',
    })
  }, [existing.data])

  useEffect(() => {
    if (!editing && !f.team_id && teamOptions.length === 1) setF((s) => ({ ...s, team_id: String(teamOptions[0].id) }))
  }, [teamOptions, editing, f.team_id])

  const isMatch = f.type === 'match'
  const [startDate = '', startTime = ''] = f.starts_at.split('T')
  const endTime = f.ends_at.split('T')[1] ?? ''
  const startOk = !!startDate && !!startTime
  // Partido: sin fin, condición ni título (el título es siempre "Equipo vs Rival"). No se envían esos campos,
  // así al editar no se borra lo que tuviera un partido anterior.
  const body = () => ({
    ...(editing ? {} : { team_id: Number(f.team_id) }),
    type: f.type,
    starts_at: fromInputValue(f.starts_at),  // "yyyy-MM-ddTHH:mm" → "yyyy-MM-dd HH:mm" (hora de Guatemala)
    location: f.location.trim() || null,
    notes: f.notes.trim() || null,
    ...(isMatch
      ? { opponent_name: f.opponent_name.trim() || null }
      : { ends_at: endTime && startDate ? `${startDate} ${endTime}` : null, title: f.title.trim() || null, opponent_name: null, home_away: null }),
  })

  // Convocatoria en el formulario: al crear un partido y al editar un borrador.
  const isDraft = !!existing.data?.is_draft
  const withCallups = isMatch && (!editing || isDraft)
  const roster = useRoster(withCallups && f.team_id ? Number(f.team_id) : undefined)
  const activePlayers = (roster.data ?? []).filter((p) => p.active)
  const [showCallups, setShowCallups] = useState(false)
  const [called, setCalled] = useState<number[]>([])
  const loadedCallups = useRef(false)
  useEffect(() => {
    // Al editar un borrador se parte de su convocatoria; al cambiar de equipo (creando) se limpia.
    if (editing && existing.data && !loadedCallups.current) {
      loadedCallups.current = true
      setCalled(existing.data.callups.filter((c) => c.status === 'called').map((c) => c.player_id))
    } else if (!editing) setCalled([])
  }, [f.team_id, editing, existing.data])
  const callupsBody = () => called.map((player_id) => ({ player_id, status: 'called' as const }))

  const qc = useQueryClient()
  const goToEvent = (ev: { id: number }, publish: boolean) =>
    navigate(`/${slug}/eventos/${ev.id}`, { replace: true, state: { saved: publish ? 'published' : 'draft', called: called.length } })

  // Crear: una sola llamada con los convocados. Borrador (publish:false) no sale en la App ni avisa;
  // publicar avisa a los padres de los convocados. Cada botón tiene su propia Idempotency-Key.
  const createBody = (publish: boolean) => ({ ...body(), publish, ...(isMatch && called.length ? { callups: callupsBody() } : {}) })
  const createDraft = usePcMutation<void, PcEvent>({
    method: 'POST', path: 'events', idempotent: true, body: () => createBody(false), invalidate: [['events']],
    onSuccess: (ev) => goToEvent(ev, false),
  })
  const createPublished = usePcMutation<void, PcEvent>({
    method: 'POST', path: 'events', idempotent: true, body: () => createBody(true), invalidate: [['events']],
    onSuccess: (ev) => goToEvent(ev, true),
  })

  // Editar un borrador: guardar datos, convocatoria y, si se pide, publicar. PUT callups y publish son
  // idempotentes (misma clave en reintentos); PATCH repetido con los mismos datos no cambia nada.
  const draftKeys = useRef<{ callups?: string; publish?: string }>({})
  const [savingDraft, setSavingDraft] = useState<null | 'draft' | 'publish'>(null)
  const [draftError, setDraftError] = useState<unknown>(null)
  const saveDraft = async (publish: boolean) => {
    setSavingDraft(publish ? 'publish' : 'draft')
    setDraftError(null)
    try {
      await request<PcEvent>(pcPath(slug, `events/${id}`), { method: 'PATCH', body: body() })
      draftKeys.current.callups ??= newIdempotencyKey()
      await requestIdempotent(pcPath(slug, `events/${id}/callups`), { method: 'PUT', body: { players: callupsBody() }, idempotencyKey: draftKeys.current.callups })
      if (publish) {
        draftKeys.current.publish ??= newIdempotencyKey()
        await requestIdempotent(pcPath(slug, `events/${id}/publish`), { method: 'POST', idempotencyKey: draftKeys.current.publish })
      }
      draftKeys.current = {}
      void qc.invalidateQueries({ queryKey: [slug, 'events'] })
      void qc.invalidateQueries({ queryKey: [slug, 'event', Number(id)] })
      goToEvent({ id: Number(id) }, publish)
    } catch (e) {
      if (e instanceof ApiError && e.status > 0 && e.status < 500) draftKeys.current = {}
      setDraftError(e)
    } finally {
      setSavingDraft(null)
    }
  }

  const create = usePcMutation<void, PcEvent>({
    method: 'POST', path: 'events', body, idempotent: true, invalidate: [['events']],
    onSuccess: (ev) => navigate(`/${slug}/eventos/${ev.id}`, { replace: true }),
  })
  const update = usePcMutation<void, PcEvent>({
    method: 'PATCH', path: `events/${id}`, body, invalidate: [['events'], ['event', Number(id)]],
    onSuccess: (ev) => navigate(`/${slug}/eventos/${ev.id}`, { replace: true }),
  })
  const m = editing ? update : create
  const busy = m.isPending || createDraft.isPending || createPublished.isPending || savingDraft !== null
  const formError = (editing ? (isDraft ? draftError : update.error) : createPublished.error ?? createDraft.error ?? create.error)

  if (teams.isLoading || (editing && existing.isLoading)) return <Spinner />
  if (editing && existing.isError) return <ErrorAlert error={existing.error} />

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((s) => ({ ...s, [k]: v }))
  const err = (k: string) => fieldError(formError, k)

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    if (!editing && isMatch) { if (called.length) createPublished.mutate() }
    else if (editing && isDraft && isMatch) void saveDraft(false)
    else m.mutate()
  }

  // Fecha y hora por separado (calendario propio + selector de hora). El fin es solo hora, el mismo día.
  const setStartDate = (d: string) => set('starts_at', `${d}T${startTime}`)
  const setStartTime = (t: string) => {
    set('starts_at', `${startDate}T${t}`)
    // Entreno: sugerir fin 1 h 30 después si no tiene (sin pasar de medianoche).
    if (!isMatch && t && !endTime) {
      const end = format(addHours(parseISO(`2000-01-01T${t}`), 1.5), 'HH:mm')
      if (end > t) set('ends_at', `${startDate}T${end}`)
    }
  }

  return (
    <>
      <PageHeader title={editing ? (f.type === 'match' ? (isDraft ? 'Editar borrador' : 'Editar partido') : f.type === 'training' ? 'Editar entreno' : 'Editar actividad') : f.type === 'match' ? 'Nuevo partido' : f.type === 'training' ? 'Nuevo entreno' : 'Nueva actividad'} subtitle="Las horas son de Guatemala." />
      <form onSubmit={submit} className="card max-w-2xl space-y-4 p-4 sm:p-6" noValidate>
        <ErrorAlert error={formError} />

        <SelectField label="Equipo" value={f.team_id} onChange={(e) => set('team_id', e.target.value)} disabled={editing} required error={err('team_id')}>
          <option value="">Elija un equipo</option>
          {teamOptions.map((t) => <option key={t.id} value={t.id}>{t.name}{t.category ? ` · ${t.category}` : ''}</option>)}
        </SelectField>

        {showTypePicker && <fieldset>
          <legend className="label">Tipo</legend>
          <div className="grid grid-cols-3 gap-2">
            {(Object.keys(EVENT_TYPE) as EventType[]).map((t) => (
              <label key={t} className={`btn cursor-pointer ring-1 ${f.type === t ? 'bg-org text-on-org ring-org' : 'bg-white ring-black/15'}`}>
                <input type="radio" name="type" value={t} checked={f.type === t} onChange={() => set('type', t)} className="sr-only" />
                {EVENT_TYPE[t]}
              </label>
            ))}
          </div>
        </fieldset>}

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <DatePicker label="Fecha" value={startDate} onChange={setStartDate} error={err('starts_at')} />
          </div>
          <TimePicker label={isMatch ? 'Hora' : 'Hora de inicio'} value={startTime} onChange={setStartTime} />
          {!isMatch && <TimePicker label="Hora de fin (opcional)" optional value={endTime} onChange={(t) => set('ends_at', t ? `${startDate}T${t}` : '')} error={err('ends_at')} />}
        </div>

        {isMatch && (
          <TextField label="Rival" value={f.opponent_name} onChange={(e) => set('opponent_name', e.target.value)} maxLength={120} required error={err('opponent_name')}
            hint={f.opponent_name.trim() && f.team_id ? `Se verá como: ${teamOptions.find((t) => String(t.id) === f.team_id)?.name ?? 'Equipo'} vs ${f.opponent_name.trim()}` : undefined} />
        )}

        {!isMatch && <TextField label="Título (opcional)" value={f.title} onChange={(e) => set('title', e.target.value)} maxLength={150} error={err('title')} />}
        <TextField label="Lugar" value={f.location} onChange={(e) => set('location', e.target.value)} maxLength={200} error={err('location')} />
        <TextAreaField label="Notas (opcional)" value={f.notes} onChange={(e) => set('notes', e.target.value)} maxLength={2000} error={err('notes')} />

        {withCallups && f.team_id && (
          <section aria-labelledby="convocar-h" className="rounded-2xl border border-black/10 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="convocar-h" className="font-bold">Convocatoria <span className="font-normal text-black/60">· {called.length} de {activePlayers.length}</span></h2>
              <button type="button" className="btn-secondary min-h-10" aria-expanded={showCallups} onClick={() => setShowCallups((v) => !v)}>
                <Users className="size-4" aria-hidden /> {showCallups ? 'Ocultar jugadores' : 'Convocar jugadores'}
              </button>
            </div>
            {showCallups && (
              roster.isLoading ? <Spinner /> : !activePlayers.length ? (
                <p className="mt-2 text-sm text-black/60">El equipo no tiene jugadores activos.</p>
              ) : (
                <>
                  <div className="mt-2 flex gap-2">
                    <button type="button" className="btn-ghost min-h-9 text-sm" onClick={() => setCalled(activePlayers.map((p) => p.id))}>Convocar a todos</button>
                    <button type="button" className="btn-ghost min-h-9 text-sm" onClick={() => setCalled([])}>Quitar todos</button>
                  </div>
                  <ul className="mt-1 max-h-80 divide-y divide-black/5 overflow-y-auto">
                    {activePlayers.map((p) => (
                      <li key={p.id}>
                        <label className="flex min-h-12 cursor-pointer items-center gap-3 py-1">
                          <input type="checkbox" className="size-5 accent-[var(--org-accent)]" checked={called.includes(p.id)}
                            onChange={(e) => setCalled((c) => (e.target.checked ? [...c, p.id] : c.filter((x) => x !== p.id)))} />
                          <Avatar name={p.full_name} url={p.photo_url} size={32} />
                          <span className="min-w-0 flex-1 truncate">
                            {p.jersey_number !== null && <span className="text-black/50">#{p.jersey_number} </span>}{p.full_name}
                          </span>
                          <span className="text-xs text-black/50">{p.position?.name}</span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </>
              )
            )}
            <p className="mt-2 text-xs text-black/60">Al publicar se avisa en la App a los padres de los convocados. En borrador no se avisa a nadie.</p>
          </section>
        )}

        {editing && existing.data?.status === 'scheduled' && (
          <p className="text-sm text-black/60">Si cambia la fecha o el lugar, se avisará a los padres de los convocados.</p>
        )}

        {isMatch && (!editing || isDraft) && called.length === 0 && (
          <p className="text-right text-sm text-amber-900">Para publicar, convoque al menos a un jugador. Puede guardarlo como borrador sin convocados.</p>
        )}
        <div className="flex flex-wrap justify-end gap-2 pt-2">
          <button type="button" className="btn-secondary" onClick={() => navigate(-1)}>Cancelar</button>
          {isMatch && (!editing || isDraft) ? (
            <>
              <button type="button" className="btn-secondary" disabled={busy || !f.team_id || !startOk || !f.opponent_name.trim()}
                onClick={() => (editing ? void saveDraft(false) : createDraft.mutate())}>
                {createDraft.isPending || savingDraft === 'draft' ? 'Guardando…' : editing ? 'Guardar borrador' : 'Borrador'}
              </button>
              {/* Regla: para publicar un partido hace falta al menos un convocado. */}
              <button type="button" className="btn-primary" disabled={busy || !f.team_id || !startOk || !f.opponent_name.trim() || called.length === 0}
                title={called.length === 0 ? 'Para publicar, convoque al menos a un jugador' : undefined}
                onClick={() => (editing ? void saveDraft(true) : createPublished.mutate())}>
                {createPublished.isPending || savingDraft === 'publish' ? 'Publicando…' : editing ? 'Guardar y publicar' : 'Crear partido y publicar'}
              </button>
            </>
          ) : (
            <button className="btn-primary" disabled={busy || !f.team_id || !startOk}>
              {busy ? 'Guardando…' : editing ? 'Guarde los cambios' : f.type === 'training' ? 'Crear entreno' : 'Crear actividad'}
            </button>
          )}
        </div>
      </form>
    </>
  )
}
