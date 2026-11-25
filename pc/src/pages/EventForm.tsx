import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Users } from 'lucide-react'
import { ApiError, newIdempotencyKey, requestIdempotent } from '../lib/api'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { addHours, format, parseISO } from 'date-fns'
import { fromInputValue, toInputValue } from '../lib/dates'
import { EVENT_TYPE } from '../lib/labels'
import { pcPath, useOrg } from '../lib/org'
import { useEvent, usePcMutation, useRoster, useTeams } from '../lib/queries'
import { useSport } from '../lib/sport'
import type { EventType, HomeAway, PcEvent } from '../lib/types'
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
  // Partido: sin fin, condición ni título (el título es siempre "Equipo vs Rival"). No se envían esos campos,
  // así al editar no se borra lo que tuviera un partido anterior.
  const body = () => ({
    ...(editing ? {} : { team_id: Number(f.team_id) }),
    type: f.type,
    starts_at: fromInputValue(f.starts_at),
    location: f.location.trim() || null,
    notes: f.notes.trim() || null,
    ...(isMatch
      ? { opponent_name: f.opponent_name.trim() || null }
      : { ends_at: fromInputValue(f.ends_at), title: f.title.trim() || null, opponent_name: null, home_away: null }),
  })

  // Convocatoria al crear un partido: jugadores activos del equipo elegido.
  const roster = useRoster(!editing && isMatch && f.team_id ? Number(f.team_id) : undefined)
  const activePlayers = (roster.data ?? []).filter((p) => p.active)
  const [showCallups, setShowCallups] = useState(false)
  const [called, setCalled] = useState<number[]>([])
  useEffect(() => { setCalled([]) }, [f.team_id])

  // "Crear partido y publicar": crea el partido y guarda la convocatoria (avisa a los padres de los convocados).
  // Cada paso tiene su Idempotency-Key; si falla la red, el reintento usa la misma y no duplica.
  const qc = useQueryClient()
  const steps = useRef<{ eventKey?: string; callupKey?: string; eventId?: number }>({})
  const [publishing, setPublishing] = useState(false)
  const [publishError, setPublishError] = useState<unknown>(null)
  const createAndPublish = async () => {
    setPublishing(true)
    setPublishError(null)
    try {
      if (!steps.current.eventId) {
        steps.current.eventKey ??= newIdempotencyKey()
        const ev = await requestIdempotent<PcEvent>(pcPath(slug, 'events'), { method: 'POST', body: body(), idempotencyKey: steps.current.eventKey })
        steps.current.eventId = ev.data.id
      }
      const eventId = steps.current.eventId
      if (called.length) {
        steps.current.callupKey ??= newIdempotencyKey()
        await requestIdempotent(pcPath(slug, `events/${eventId}/callups`), {
          method: 'PUT', body: { players: called.map((player_id) => ({ player_id, status: 'called' })) }, idempotencyKey: steps.current.callupKey,
        })
      }
      steps.current = {}
      void qc.invalidateQueries({ queryKey: [slug, 'events'] })
      navigate(`/${slug}/eventos/${eventId}`, { replace: true, state: { published: true, called: called.length } })
    } catch (e) {
      // Error de validación o negocio: la próxima vez es otra acción (clave nueva) del paso que falló.
      if (e instanceof ApiError && e.status > 0 && e.status < 500) {
        if (steps.current.eventId) steps.current.callupKey = undefined
        else steps.current.eventKey = undefined
      }
      setPublishError(e)
    } finally {
      setPublishing(false)
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
  const busy = m.isPending || publishing
  const formError = m.error ?? publishError

  if (teams.isLoading || (editing && existing.isLoading)) return <Spinner />
  if (editing && existing.isError) return <ErrorAlert error={existing.error} />

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((s) => ({ ...s, [k]: v }))
  const err = (k: string) => fieldError(formError, k)

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    if (!editing && isMatch) void createAndPublish()
    else m.mutate()
  }

  const suggestEnd = () => {
    if (!isMatch && f.starts_at && !f.ends_at) set('ends_at', format(addHours(parseISO(f.starts_at), f.type === 'match' ? 2 : 1.5), "yyyy-MM-dd'T'HH:mm"))
  }

  return (
    <>
      <PageHeader title={editing ? (f.type === 'match' ? 'Editar partido' : f.type === 'training' ? 'Editar entreno' : 'Editar actividad') : f.type === 'match' ? 'Nuevo partido' : f.type === 'training' ? 'Nuevo entreno' : 'Nueva actividad'} subtitle="Las horas son de Guatemala." />
      <form onSubmit={submit} className="card max-w-2xl space-y-4 p-4 sm:p-6" noValidate>
        <ErrorAlert error={formError} />
        {publishError != null && steps.current.eventId && (
          <p className="text-sm text-amber-900">El partido ya se creó; falta guardar la convocatoria. Presione de nuevo "Crear partido y publicar".</p>
        )}

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

        <div className={isMatch ? '' : 'grid gap-4 sm:grid-cols-2'}>
          <TextField label={isMatch ? 'Fecha y hora' : 'Inicio'} type="datetime-local" value={f.starts_at} onChange={(e) => set('starts_at', e.target.value)} onBlur={suggestEnd} required error={err('starts_at')} />
          {!isMatch && <TextField label="Fin (opcional)" type="datetime-local" value={f.ends_at} onChange={(e) => set('ends_at', e.target.value)} error={err('ends_at')} />}
        </div>

        {isMatch && (
          <TextField label="Rival" value={f.opponent_name} onChange={(e) => set('opponent_name', e.target.value)} maxLength={120} required error={err('opponent_name')}
            hint={f.opponent_name.trim() && f.team_id ? `Se verá como: ${teamOptions.find((t) => String(t.id) === f.team_id)?.name ?? 'Equipo'} vs ${f.opponent_name.trim()}` : undefined} />
        )}

        {!isMatch && <TextField label="Título (opcional)" value={f.title} onChange={(e) => set('title', e.target.value)} maxLength={150} error={err('title')} />}
        <TextField label="Lugar" value={f.location} onChange={(e) => set('location', e.target.value)} maxLength={200} error={err('location')} />
        <TextAreaField label="Notas (opcional)" value={f.notes} onChange={(e) => set('notes', e.target.value)} maxLength={2000} error={err('notes')} />

        {!editing && isMatch && f.team_id && (
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
            <p className="mt-2 text-xs text-black/60">Al publicar se avisa en la App a los padres de los convocados. Puede cambiar la convocatoria después.</p>
          </section>
        )}

        {editing && existing.data?.status === 'scheduled' && (
          <p className="text-sm text-black/60">Si cambia la fecha o el lugar, se avisará a los padres de los convocados.</p>
        )}

        <div className="flex flex-wrap justify-end gap-2 pt-2">
          <button type="button" className="btn-secondary" onClick={() => navigate(-1)}>Cancelar</button>
          <button className="btn-primary" disabled={busy || !f.team_id || !f.starts_at || (isMatch && !f.opponent_name.trim())}>
            {busy ? 'Guardando…' : editing ? 'Guarde los cambios' : isMatch ? 'Crear partido y publicar' : f.type === 'training' ? 'Crear entreno' : 'Crear actividad'}
          </button>
        </div>
      </form>
    </>
  )
}
