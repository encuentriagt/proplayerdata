import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useOrg } from '../lib/org'
import { usePcMutation, useTeams } from '../lib/queries'
import type { PlayerDetail, Team, TeamDetail } from '../lib/types'
import { Modal } from '../components/Modal'
import { ErrorAlert, SelectField, TextAreaField, TextField, fieldError } from '../components/ui'

interface Props {
  /** Equipo fijo (desde el detalle del equipo). */
  team?: TeamDetail
  /** Jugador a editar; sin él se crea uno nuevo. */
  player?: PlayerDetail
  onClose: () => void
}

/** Datos mínimos del menor: nombre, apellidos, fecha de nacimiento, género, documento (opcional) y notas. */
export function PlayerFormDialog({ team, player, onClose }: Props) {
  const { slug, can } = useOrg()
  const teamOptional = can.create_players_without_team
  const navigate = useNavigate()
  const teams = useTeams()
  const [f, setF] = useState({
    first_name: player?.first_name ?? '',
    last_name: player?.last_name ?? '',
    birthdate: player?.birthdate ?? '',
    gender: player?.gender ?? '',
    document_number: player?.document_number ?? '',
    notes: player?.notes ?? '',
    team_id: team ? String(team.id) : '',
    jersey_number: '',
  })
  const set = (k: keyof typeof f, v: string) => setF((s) => ({ ...s, [k]: v }))

  const base = () => ({
    first_name: f.first_name.trim(), last_name: f.last_name.trim(),
    birthdate: f.birthdate || null, gender: f.gender || null,
    document_number: f.document_number.trim() || null, notes: f.notes.trim() || null,
  })

  const create = usePcMutation<void, PlayerDetail>({
    method: 'POST', path: 'players', idempotent: true,
    body: () => ({ ...base(), team_id: f.team_id ? Number(f.team_id) : null, jersey_number: f.jersey_number === '' ? null : Number(f.jersey_number) }),
    invalidate: [['players'], ['roster']],
    onSuccess: (p) => { onClose(); if (!team) navigate(`/${slug}/jugadores/${p.id}`) },
  })
  const update = usePcMutation<void, PlayerDetail>({
    method: 'PATCH', path: `players/${player?.id}`, body: base,
    invalidate: [['players'], ['player', player?.id], ['roster']], onSuccess: onClose,
  })
  const m = player ? update : create
  const err = (k: string) => fieldError(m.error, k)

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!m.isPending) m.mutate()
  }

  const teamOptions: Team[] = teams.data ?? []

  return (
    <Modal title={player ? 'Editar jugador' : 'Nuevo jugador'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3" noValidate>
        <ErrorAlert error={m.error} />
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField label="Nombre(s)" value={f.first_name} onChange={(e) => set('first_name', e.target.value)} required maxLength={80} error={err('first_name')} autoFocus />
          <TextField label="Apellidos" value={f.last_name} onChange={(e) => set('last_name', e.target.value)} required maxLength={80} error={err('last_name')} />
          <TextField label="Fecha de nacimiento" type="date" value={f.birthdate} onChange={(e) => set('birthdate', e.target.value)} error={err('birthdate')} />
          <SelectField label="Género" value={f.gender} onChange={(e) => set('gender', e.target.value)} error={err('gender')}>
            <option value="">Sin indicar</option>
            <option value="male">Masculino</option>
            <option value="female">Femenino</option>
            <option value="other">Otro</option>
          </SelectField>
        </div>
        <TextField label="Documento (opcional)" value={f.document_number} onChange={(e) => set('document_number', e.target.value)} maxLength={40}
          hint="Solo si su institución lo requiere." error={err('document_number')} />
        <TextAreaField label="Notas (opcional)" value={f.notes} onChange={(e) => set('notes', e.target.value)} maxLength={2000} error={err('notes')} />

        {!player && (
          <div className="grid gap-3 sm:grid-cols-[1fr_7rem]">
            <SelectField label={teamOptional ? 'Equipo (opcional)' : 'Equipo'} value={f.team_id} onChange={(e) => set('team_id', e.target.value)} disabled={!!team} error={err('team_id')}>
              {!team && <option value="">{teamOptional ? 'Sin equipo por ahora' : 'Elija un equipo'}</option>}
              {(team ? [team] : teamOptions).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </SelectField>
            <TextField label="Dorsal" type="number" inputMode="numeric" min={0} max={999} value={f.jersey_number}
              onChange={(e) => set('jersey_number', e.target.value)} error={err('jersey_number')} disabled={!f.team_id} />
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" disabled={m.isPending || !f.first_name.trim() || !f.last_name.trim() || (!teamOptional && !player && !f.team_id)}>
            {m.isPending ? 'Guardando…' : player ? 'Guarde los cambios' : 'Crear jugador'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
