import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { addHours, format, parseISO } from 'date-fns'
import { fromInputValue, toInputValue } from '../lib/dates'
import { EVENT_TYPE, HOME_AWAY } from '../lib/labels'
import { useOrg } from '../lib/org'
import { useEvent, usePcMutation, useTeams } from '../lib/queries'
import type { EventType, HomeAway, PcEvent } from '../lib/types'
import { ErrorAlert, PageHeader, SelectField, Spinner, TextAreaField, TextField, fieldError } from '../components/ui'

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
  const existing = useEvent(editing ? Number(id) : undefined)

  const [f, setF] = useState<FormState>(() => ({
    team_id: params.get('equipo') ?? '',
    type: (params.get('tipo') as EventType) || 'match',
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
    if (!editing && !f.team_id && teams.data?.length === 1) setF((s) => ({ ...s, team_id: String(teams.data![0].id) }))
  }, [teams.data, editing, f.team_id])

  const body = () => ({
    ...(editing ? {} : { team_id: Number(f.team_id) }),
    type: f.type,
    starts_at: fromInputValue(f.starts_at),
    ends_at: fromInputValue(f.ends_at),
    title: f.title.trim() || null,
    location: f.location.trim() || null,
    opponent_name: f.type === 'match' ? f.opponent_name.trim() || null : null,
    home_away: f.type === 'match' ? f.home_away || null : null,
    notes: f.notes.trim() || null,
  })

  const create = usePcMutation<void, PcEvent>({
    method: 'POST', path: 'events', body, idempotent: true, invalidate: [['events']],
    onSuccess: (ev) => navigate(`/${slug}/eventos/${ev.id}`, { replace: true }),
  })
  const update = usePcMutation<void, PcEvent>({
    method: 'PATCH', path: `events/${id}`, body, invalidate: [['events'], ['event', Number(id)]],
    onSuccess: (ev) => navigate(`/${slug}/eventos/${ev.id}`, { replace: true }),
  })
  const m = editing ? update : create

  if (teams.isLoading || (editing && existing.isLoading)) return <Spinner />
  if (editing && existing.isError) return <ErrorAlert error={existing.error} />

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((s) => ({ ...s, [k]: v }))
  const err = (k: string) => fieldError(m.error, k)

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!m.isPending) m.mutate()
  }

  const suggestEnd = () => {
    if (f.starts_at && !f.ends_at) set('ends_at', format(addHours(parseISO(f.starts_at), f.type === 'match' ? 2 : 1.5), "yyyy-MM-dd'T'HH:mm"))
  }

  return (
    <>
      <PageHeader title={editing ? 'Editar actividad' : f.type === 'match' ? 'Nuevo partido' : f.type === 'training' ? 'Nuevo entreno' : 'Nueva actividad'} subtitle="Las horas son de Guatemala." />
      <form onSubmit={submit} className="card max-w-2xl space-y-4 p-4 sm:p-6" noValidate>
        <ErrorAlert error={m.error} />

        <SelectField label="Equipo" value={f.team_id} onChange={(e) => set('team_id', e.target.value)} disabled={editing} required error={err('team_id')}>
          <option value="">Elija un equipo</option>
          {teams.data?.map((t) => <option key={t.id} value={t.id}>{t.name}{t.category ? ` · ${t.category}` : ''}</option>)}
        </SelectField>

        <fieldset>
          <legend className="label">Tipo</legend>
          <div className="grid grid-cols-3 gap-2">
            {(Object.keys(EVENT_TYPE) as EventType[]).map((t) => (
              <label key={t} className={`btn cursor-pointer ring-1 ${f.type === t ? 'bg-org text-on-org ring-org' : 'bg-white ring-black/15'}`}>
                <input type="radio" name="type" value={t} checked={f.type === t} onChange={() => set('type', t)} className="sr-only" />
                {EVENT_TYPE[t]}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Inicio" type="datetime-local" value={f.starts_at} onChange={(e) => set('starts_at', e.target.value)} onBlur={suggestEnd} required error={err('starts_at')} />
          <TextField label="Fin (opcional)" type="datetime-local" value={f.ends_at} onChange={(e) => set('ends_at', e.target.value)} error={err('ends_at')} />
        </div>

        {f.type === 'match' && (
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Rival" value={f.opponent_name} onChange={(e) => set('opponent_name', e.target.value)} maxLength={120} error={err('opponent_name')} />
            <SelectField label="Condición" value={f.home_away} onChange={(e) => set('home_away', e.target.value as HomeAway | '')} error={err('home_away')}>
              <option value="">Sin indicar</option>
              {(Object.keys(HOME_AWAY) as HomeAway[]).map((h) => <option key={h} value={h}>{HOME_AWAY[h]}</option>)}
            </SelectField>
          </div>
        )}

        <TextField label="Título (opcional)" value={f.title} onChange={(e) => set('title', e.target.value)} maxLength={150}
          hint={f.type === 'match' ? 'Si lo deja vacío se usa el nombre del rival.' : undefined} error={err('title')} />
        <TextField label="Lugar" value={f.location} onChange={(e) => set('location', e.target.value)} maxLength={200} error={err('location')} />
        <TextAreaField label="Notas (opcional)" value={f.notes} onChange={(e) => set('notes', e.target.value)} maxLength={2000} error={err('notes')} />

        {editing && existing.data?.status === 'scheduled' && (
          <p className="text-sm text-black/60">Si cambia la fecha o el lugar, se avisará a los padres de los convocados.</p>
        )}

        <div className="flex flex-wrap justify-end gap-2 pt-2">
          <button type="button" className="btn-secondary" onClick={() => navigate(-1)}>Cancelar</button>
          <button className="btn-primary" disabled={m.isPending || !f.team_id || !f.starts_at}>
            {m.isPending ? 'Guardando…' : editing ? 'Guarde los cambios' : f.type === 'match' ? 'Crear partido' : f.type === 'training' ? 'Crear entreno' : 'Crear actividad'}
          </button>
        </div>
      </form>
    </>
  )
}
