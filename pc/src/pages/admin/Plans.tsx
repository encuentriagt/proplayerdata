import { useState, type FormEvent } from 'react'
import { fmt } from '../../lib/dates'
import { usePcMutation, usePlans } from '../../lib/queries'
import type { PlanGrant, PlanUsage } from '../../lib/types'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { Alert, Empty, ErrorAlert, SelectField, Spinner, TextField, fieldError } from '../../components/ui'

const PLAN_LABEL = { pro: 'Pro', premium: 'Premium' } as const

// Sin precios en ninguna parte: solo cupos asignados por ppd.
export function AdminPlans() {
  const plans = usePlans()
  const [revoking, setRevoking] = useState<PlanGrant | null>(null)
  const revoke = usePcMutation<PlanGrant>({ method: 'DELETE', path: (g) => `plans/${g.id}`, invalidate: [['plans']], onSuccess: () => setRevoking(null) })

  if (plans.isLoading) return <Spinner />
  if (plans.isError || !plans.data) return <ErrorAlert error={plans.error} />
  const usage = plans.data.meta.usage

  return (
    <>
      <h2 className="title mb-3 text-2xl">Planes de padres</h2>
      <div className="mb-5 grid gap-3 sm:grid-cols-2">
        <UsageBar label="Premium" sub="Todos sus hijos" u={usage.premium} />
        <UsageBar label="Pro" sub="Un hijo" u={usage.pro} />
      </div>

      <AssignForm usage={usage} />

      <h3 className="mb-2 mt-6 font-bold">Planes vigentes</h3>
      <ErrorAlert error={revoke.error} />
      {!plans.data.data.length ? <Empty>Aún no ha asignado planes.</Empty> : (
        <ul className="card divide-y divide-black/5">
          {plans.data.data.map((g) => (
            <li key={g.id} className="flex flex-wrap items-center gap-3 p-3">
              <span className={`chip ${g.plan === 'premium' ? 'bg-org-2 text-ink' : 'bg-org/15'}`}>{PLAN_LABEL[g.plan]}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{g.user_name}</p>
                <p className="truncate text-xs text-black/60">
                  {g.user_email}{g.ends_at ? ` · vence ${fmt(g.ends_at, "d MMM yyyy")}` : ' · sin vencimiento'}{g.note ? ` · ${g.note}` : ''}
                </p>
              </div>
              {<button className="btn-ghost min-h-9 text-sm text-red-700" onClick={() => setRevoking(g)}>Revocar</button>}
            </li>
          ))}
        </ul>
      )}
      <ConfirmDialog open={!!revoking} title={`¿Revocar el plan ${revoking ? PLAN_LABEL[revoking.plan] : ''}?`} confirmLabel="Revocar" danger busy={revoke.isPending}
        onConfirm={() => revoking && revoke.mutate(revoking)} onCancel={() => setRevoking(null)}>
        {revoking?.user_name} pasará al plan Gratis y se liberará un cupo.
      </ConfirmDialog>
    </>
  )
}

function UsageBar({ label, sub, u }: { label: string; sub: string; u: { quota: number; used: number } }) {
  const pct = u.quota ? Math.min(100, Math.round((u.used / u.quota) * 100)) : 0
  return (
    <div className="card p-4">
      <div className="flex items-baseline justify-between">
        <p className="font-bold">{label} <span className="text-sm font-normal text-black/60">· {sub}</span></p>
        <p className="text-sm"><strong>{u.used}</strong> de {u.quota}</p>
      </div>
      <div className="mt-2 h-3 overflow-hidden rounded-full bg-black/10" role="progressbar" aria-label={`Cupo ${label}`} aria-valuenow={u.used} aria-valuemin={0} aria-valuemax={u.quota}>
        <div className={`h-full rounded-full ${pct >= 100 ? 'bg-red-700' : 'bg-org'}`} style={{ width: `${pct}%` }} />
      </div>
      {u.quota === 0 && <p className="mt-2 text-xs text-black/60">Su organización no tiene cupo de este plan.</p>}
    </div>
  )
}

function AssignForm({ usage }: { usage: PlanUsage }) {
  const [email, setEmail] = useState('')
  const [plan, setPlan] = useState<'pro' | 'premium'>(usage.premium.quota > usage.premium.used ? 'premium' : 'pro')
  const [endsAt, setEndsAt] = useState('')
  const [note, setNote] = useState('')
  const [ok, setOk] = useState(false)
  const assign = usePcMutation({
    method: 'POST', path: 'plans', idempotent: true,
    body: () => ({ email: email.trim(), plan, ends_at: endsAt || null, note: note.trim() || null }),
    invalidate: [['plans']],
    onSuccess: () => { setOk(true); setEmail(''); setNote(''); setEndsAt('') },
  })
  const full = usage[plan].used >= usage[plan].quota
  const submit = (e: FormEvent) => { e.preventDefault(); setOk(false); if (!assign.isPending) assign.mutate() }

  return (
    <form onSubmit={submit} className="card space-y-3 p-4" noValidate>
      <h3 className="font-bold">Asignar plan a un padre o madre</h3>
      {ok && <Alert tone="success">Plan asignado.</Alert>}
      <ErrorAlert error={assign.error} />
      <div className="grid gap-3 sm:grid-cols-[1fr_10rem]">
        <TextField label="Correo del padre o madre" type="email" inputMode="email" value={email} onChange={(e) => { setOk(false); setEmail(e.target.value) }}
          required error={fieldError(assign.error, 'email')} hint="Debe tener cuenta y un hijo en su organización." />
        <SelectField label="Plan" value={plan} onChange={(e) => setPlan(e.target.value as typeof plan)}>
          <option value="premium">Premium</option>
          <option value="pro">Pro</option>
        </SelectField>
        <TextField label="Vence (opcional)" type="date" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} error={fieldError(assign.error, 'ends_at')} />
        <TextField label="Nota (opcional)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} />
      </div>
      {full && <p className="text-sm text-red-700">No le quedan cupos {PLAN_LABEL[plan]}. Revoque uno o consulte con ppd.</p>}
      <button className="btn-primary" disabled={assign.isPending || !email.includes('@') || full}>{assign.isPending ? 'Asignando…' : 'Asignar plan'}</button>
    </form>
  )
}
