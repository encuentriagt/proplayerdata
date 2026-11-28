<?php

namespace App\Http\Controllers\Pc;

use App\Http\Controllers\Controller;
use App\Models\Attendance;
use App\Models\Event;
use App\Models\EventCallup;
use App\Models\Organization;
use App\Models\Team;
use App\Models\TeamPlayer;
use App\Services\EventNotifier;
use App\Services\MatchSheetService;
use App\Support\ApiError;
use App\Support\Audit;
use App\Support\OrgAccess;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/** Calendario: partidos, entrenamientos y otras actividades; convocatorias, asistencia y ficha del partido. */
class EventController extends Controller
{
    public function __construct(private EventNotifier $notifier) {}

    /** ?from=YYYY-MM-DD&to=YYYY-MM-DD (máx. 120 días) &team_id= &type= */
    public function index(Request $request, Organization $organization, OrgAccess $access): JsonResponse
    {
        $data = $request->validate([
            'from' => ['nullable', 'date'], 'to' => ['nullable', 'date', 'after_or_equal:from'],
            'team_id' => ['nullable', 'integer'], 'type' => ['nullable', Rule::in(['match', 'training', 'other'])],
            'pending_sheet' => ['nullable', 'boolean'],
            'sport_id' => ['nullable', 'integer'],
            'undated_drafts' => ['nullable', 'boolean'],
        ]);
        $pending = $request->boolean('pending_sheet');
        if ($pending) {
            // Partidos ya jugados (últimos 120 días), no cancelados y sin resultado publicado.
            $from = CarbonImmutable::now()->subDays(120)->startOfDay();
            $to = CarbonImmutable::now();
        } else {
            $from = CarbonImmutable::parse($data['from'] ?? now()->startOfMonth())->startOfDay();
            $to = CarbonImmutable::parse($data['to'] ?? $from->addDays(41))->endOfDay();
            // Hasta 120 días entre from y to (to completo): p. ej. 2026-01-01 a 2026-05-01.
            if ($from->diffInDays($to->startOfDay()) > 120) {
                return ApiError::response('range_too_large', 'El rango máximo es de 120 días.', 422);
            }
        }

        $teamIds = $access->teamIds();
        if (! empty($data['team_id'])) {
            $access->authorize(in_array((int) $data['team_id'], $teamIds, true));
            $teamIds = [(int) $data['team_id']];
        }
        if (! empty($data['sport_id'])) {
            $teamIds = \App\Models\Team::whereIn('id', $teamIds ?: [0])->where('sport_id', (int) $data['sport_id'])->pluck('id')->all();
        }

        if ($request->boolean('undated_drafts')) {
            $drafts = Event::with('team:id,name')->whereIn('team_id', $teamIds ?: [0])->whereNull('published_at')->whereNull('starts_at')
                ->when($data['type'] ?? null, fn ($q, $t) => $q->where('type', $t))->orderByDesc('updated_at')->limit(200)->get();

            return response()->json(['data' => $drafts->map->payload()->values()]);
        }

        $events = Event::with('team:id,name')
            ->whereIn('team_id', $teamIds)
            ->whereBetween('starts_at', [$from, $to])
            ->when($data['type'] ?? null, fn ($q, $t) => $q->where('type', $t))
            ->when($pending, fn ($q) => $q->published()->where('type', 'match')->where('status', '!=', 'cancelled')->whereNull('result_published_at'))
            ->orderBy('starts_at')->get();

        return response()->json(['data' => $events->map->payload()->values()]);
    }

    public function show(Organization $organization, Event $event, OrgAccess $access): JsonResponse
    {
        $access->authorize($access->canViewTeam($event->team));
        $event->load(['team.sport', 'callups.player', 'attendances.player', 'lineup.player', 'lineup.position', 'actions.statType', 'playerStats']);

        $event->team->sport->load('statTypes');
        \App\Support\Positions::apply($event->team->sport, $organization->id);
        $data = $event->payload();
        $data['sport'] = $event->team->sport->payload();
        $data['callups'] = $event->callups->map(fn ($c) => [
            'player_id' => $c->player_id, 'player_name' => $c->player?->fullName(), 'status' => $c->status,
            'guardian_response' => $c->guardian_response, 'responded_at' => $c->responded_at?->toIso8601String(),
        ])->values();
        // Lesión: si algún padre ya tocó "Enterado" en la App.
        $acks = \App\Models\UserNotification::where('kind', 'injury')->where('data->event_id', (string) $event->id)
            ->whereNotNull('acked_at')->get(['player_id', 'acked_at'])->groupBy('player_id');
        $data['attendance'] = $event->attendances->map(fn ($a) => [
            'player_id' => $a->player_id, 'player_name' => $a->player?->fullName(), 'status' => $a->status, 'note' => $a->note,
            'injury_acked_at' => $a->status === 'injured' ? $acks->get($a->player_id)?->min('acked_at')?->toIso8601String() : null,
        ])->values();
        $data['lineup'] = $event->lineup->map(fn ($l) => [
            'player_id' => $l->player_id, 'player_name' => $l->player?->fullName(), 'is_starter' => $l->is_starter,
            'sport_position_id' => $l->sport_position_id, 'position_name' => $l->position?->name, 'jersey_number' => $l->jersey_number, 'minutes_played' => $l->minutes_played,
        ])->values();
        $data['actions'] = $event->actions->map(fn ($a) => [
            'type' => $a->type, 'stat_code' => $a->statType?->code, 'player_id' => $a->player_id,
            'related_player_id' => $a->related_player_id, 'period' => $a->period, 'minute' => $a->minute,
            'value' => $a->value, 'note' => $a->note,
        ])->values();
        $data['player_stats'] = $event->playerStats->map(fn ($s) => [
            'player_id' => $s->player_id, 'minutes_played' => $s->minutes_played, 'stats' => (object) ($s->stats ?? []),
        ])->values();

        return response()->json(['data' => $data]);
    }

    public function store(Request $request, Organization $organization, OrgAccess $access): JsonResponse
    {
        $data = $request->validate(array_merge($this->rules($organization), [
            'publish' => ['sometimes', 'boolean'],
            'callups' => ['sometimes', 'array', 'max:80'],
            'callups.*.player_id' => ['required', 'integer', 'distinct'],
            'callups.*.status' => ['sometimes', Rule::in(['called', 'reserve'])],
            'notify' => ['sometimes', 'boolean'],
        ]));
        $team = Team::where('organization_id', $organization->id)->findOrFail($data['team_id']);
        $access->authorize($access->canWorkOnTeam($team));
        $publish = $data['publish'] ?? true;
        $callups = $data['callups'] ?? null;
        $trainingNotice = ($data['notify'] ?? false) && $data['type'] === 'training';
        unset($data['publish'], $data['callups'], $data['notify']);
        if ($callups !== null && ($bad = $this->notOnRoster($team->id, $callups))) {
            return $bad;
        }
        if ($publish) {
            // Sin publish explícito (flujo anterior: crear y luego convocar) solo se exige la fecha.
            $explicit = $request->has('publish');
            if ($bad = $this->publishProblems($data['type'], $data['starts_at'] ?? null, $explicit ? ($data['opponent_name'] ?? null) : 'x', $explicit ? count($callups ?? []) : 1, (bool) ($data['time_pending'] ?? false))) {
                return $bad;
            }
        }

        $event = DB::transaction(function () use ($data, $organization, $access, $publish, $callups) {
            $event = Event::create(array_merge($data, [
                'organization_id' => $organization->id, 'status' => 'scheduled', 'created_by' => $access->user->id,
                'published_at' => $publish ? now() : null,
            ]));
            foreach ($callups ?? [] as $p) {
                EventCallup::create(['event_id' => $event->id, 'player_id' => $p['player_id'], 'status' => $p['status'] ?? 'called']);
            }

            return $event;
        });
        if ($publish && $callups && $event->starts_at->isFuture()) {
            $ids = array_map(fn ($p) => (int) $p['player_id'], $callups);
            // Entreno con notify: un solo aviso por padre, sin nombres. Si no, el aviso de convocatoria de siempre.
            $trainingNotice ? $this->notifier->trainingsScheduled(collect([$event]), $ids, "event:{$event->id}") : $this->notifier->callups($event, $ids);
        }
        if ($publish && $event->type === 'match') {
            $this->notifier->matchPublished($event, $access->user->id);
        }
        Audit::log('event.created', $event, ['type' => $event->type, 'team_id' => $team->id, 'draft' => ! $publish], $organization->id);

        return response()->json(['data' => $event->load('team:id,name')->payload()], 201);
    }

    /**
     * Entrenos recurrentes: crea todos (publicados) en una transacción con un series_id común.
     * Con notify, un solo aviso por padre de los convocados para toda la serie.
     */
    public function series(Request $request, Organization $organization, OrgAccess $access): JsonResponse
    {
        $data = $request->validate([
            'team_id' => ['required', 'integer', Rule::exists('teams', 'id')->where('organization_id', $organization->id)->whereNull('deleted_at')],
            'type' => ['required', Rule::in(['training'])],
            'from' => ['required', 'date_format:Y-m-d', 'after_or_equal:today'],
            'until' => ['required', 'date_format:Y-m-d', 'after_or_equal:from'],
            'weekdays' => ['required', 'array', 'min:1', 'max:7'],
            'weekdays.*' => ['integer', 'distinct', 'between:1,7'],
            'time' => ['required', 'date_format:H:i'],
            'title' => ['nullable', 'string', 'max:150'],
            'location' => ['nullable', 'string', 'max:200'],
            'notes' => ['nullable', 'string', 'max:2000'],
            'callups' => ['required', 'array', 'min:1', 'max:80'],
            'callups.*.player_id' => ['required', 'integer', 'distinct'],
            'callups.*.status' => ['sometimes', Rule::in(['called', 'reserve'])],
            'notify' => ['sometimes', 'boolean'],
        ]);
        $team = Team::where('organization_id', $organization->id)->findOrFail($data['team_id']);
        $access->authorize($access->canWorkOnTeam($team));
        if ($bad = $this->notOnRoster($team->id, $data['callups'])) {
            return $bad;
        }
        $from = \Carbon\CarbonImmutable::parse($data['from']);
        $until = \Carbon\CarbonImmutable::parse($data['until']);
        if ($until->gt($from->addYear())) {
            return ApiError::response('validation_failed', '"Hasta" debe estar dentro de un año.', 422, ['fields' => ['until' => ['Máximo un año.']]]);
        }
        [$h, $m] = array_map('intval', explode(':', $data['time']));
        $dates = [];
        for ($d = $from; $d->lte($until); $d = $d->addDay()) {
            if (in_array($d->isoWeekday(), $data['weekdays'], true)) {
                $at = $d->setTime($h, $m);
                if ($at->isFuture()) {
                    $dates[] = $at;
                }
            }
            if (count($dates) > 200) {
                return ApiError::response('series_too_large', 'Una serie puede tener como máximo 200 entrenos.', 422);
            }
        }
        if (! $dates) {
            return ApiError::response('series_empty', 'Con esos días y fechas no queda ningún entreno por crear.', 422);
        }

        $seriesId = (string) \Illuminate\Support\Str::uuid();
        $events = DB::transaction(function () use ($dates, $data, $team, $organization, $access, $seriesId) {
            $now = now();
            $created = collect();
            foreach ($dates as $at) {
                $e = Event::create([
                    'organization_id' => $organization->id, 'team_id' => $team->id, 'series_id' => $seriesId, 'type' => 'training',
                    'title' => $data['title'] ?? null, 'location' => $data['location'] ?? null, 'notes' => $data['notes'] ?? null,
                    'starts_at' => $at, 'status' => 'scheduled', 'created_by' => $access->user->id, 'published_at' => $now,
                ]);
                $rows = array_map(fn ($p) => ['event_id' => $e->id, 'player_id' => (int) $p['player_id'], 'status' => $p['status'] ?? 'called', 'created_at' => $now, 'updated_at' => $now], $data['callups']);
                EventCallup::insert($rows);
                $created->push($e);
            }

            return $created;
        });

        $notified = 0;
        if ($data['notify'] ?? false) {
            $notified = $this->notifier->trainingsScheduled($events, array_map(fn ($p) => (int) $p['player_id'], $data['callups']), "series:{$seriesId}");
        }
        Audit::log('event.series_created', $events->first(), ['series_id' => $seriesId, 'count' => $events->count(), 'team_id' => $team->id], $organization->id);

        return response()->json(['data' => ['series_id' => $seriesId, 'count' => $events->count(), 'notified' => $notified]], 201);
    }

    /**
     * Publica un borrador: aparece en la App y avisa a los padres de los convocados.
     * Si ya estaba publicado responde igual sin volver a avisar (idempotente).
     */
    public function publish(Organization $organization, Event $event, OrgAccess $access): JsonResponse
    {
        $access->authorize($access->canWorkOnTeam($event->team));
        if ($event->status === 'cancelled') {
            return ApiError::response('event_closed', 'La actividad está cancelada.', 422);
        }
        if ($event->isDraft() && ($bad = $this->publishProblems($event->type, $event->starts_at, $event->opponent_name, EventCallup::where('event_id', $event->id)->count(), (bool) $event->time_pending))) {
            return $bad;
        }
        $published = DB::transaction(function () use ($event) {
            $locked = Event::whereKey($event->id)->lockForUpdate()->first();
            if (! $locked->isDraft()) {
                return false;
            }
            $locked->update(['published_at' => now()]);

            return true;
        });
        $event->refresh();
        if ($published) {
            $called = EventCallup::where('event_id', $event->id)->pluck('player_id')->map(fn ($i) => (int) $i)->all();
            if ($called && $event->starts_at->isFuture()) {
                $this->notifier->callups($event, $called);
            }
            // Si ya había asistencia guardada en el borrador, se avisa ahora.
            $withAttendance = Attendance::where('event_id', $event->id)->pluck('player_id')->map(fn ($i) => (int) $i)->all();
            if ($withAttendance && $event->type === 'match') {
                $this->notifier->attendance($event, $withAttendance);
            }
            if ($event->type === 'match') {
                $this->notifier->matchPublished($event, $access->user->id);
            }
            Audit::log('event.published', $event, ['callups' => count($called)], $organization->id);
        }

        return response()->json(['data' => $event->load('team:id,name')->payload()]);
    }

    public function update(Request $request, Organization $organization, Event $event, OrgAccess $access): JsonResponse
    {
        $access->authorize($access->canWorkOnTeam($event->team));
        $data = $request->validate(array_merge($this->rules($organization, true), [
            'status' => ['sometimes', Rule::in(['scheduled', 'cancelled'])],
        ]));
        unset($data['team_id']); // no se mueve de equipo
        if (array_key_exists('starts_at', $data) && $data['starts_at'] === null && ! $event->isDraft()) {
            return ApiError::response('validation_failed', 'Una actividad publicada necesita fecha.', 422, ['fields' => ['starts_at' => ['La fecha es obligatoria.']]]);
        }
        if (! empty($data['time_pending']) && ! $event->isDraft()) {
            return ApiError::response('validation_failed', 'Una actividad publicada necesita hora.', 422, ['fields' => ['starts_at' => ['La hora es obligatoria.']]]);
        }
        if (array_key_exists('opponent_name', $data) && blank($data['opponent_name']) && $event->type === 'match' && ! $event->isDraft()) {
            return ApiError::response('validation_failed', 'Un partido publicado necesita rival.', 422, ['fields' => ['opponent_name' => ['El rival es obligatorio.']]]);
        }

        $before = [$event->starts_at?->format('YmdHi'), $event->location, $event->status];
        $event->update($data);
        $after = [$event->starts_at?->format('YmdHi'), $event->location, $event->status];

        $cancelled = $event->status === 'cancelled' && $before[2] !== 'cancelled';
        $moved = ! $cancelled && $event->status === 'scheduled' && ($before[0] !== $after[0] || $before[1] !== $after[1]) && $event->starts_at?->isFuture();
        if (($cancelled || $moved) && ! $event->isDraft()) {
            $this->notifier->changed($event, $cancelled);
        }
        Audit::log('event.updated', $event, ['fields' => array_keys($data)], $organization->id);

        return response()->json(['data' => $event->fresh('team:id,name')->payload()]);
    }

    public function destroy(Organization $organization, Event $event, OrgAccess $access): JsonResponse
    {
        $access->authorize($access->canWorkOnTeam($event->team));
        if ($event->result_published_at) {
            return ApiError::response('event_has_result', 'No se puede borrar un partido con resultado publicado.', 422);
        }
        // Lo publicado y programado ya lo vieron los padres: primero se cancela (y se les avisa).
        if (! $event->isDraft() && $event->status === 'scheduled') {
            return ApiError::response('event_must_cancel', 'Cancele la actividad antes de borrarla: los padres ya la ven en la App.', 422);
        }
        $event->delete();
        Audit::log('event.deleted', $event, [], $organization->id);

        return response()->json(['data' => ['ok' => true]]);
    }

    /** Reemplaza la lista de convocados. Avisa a los padres de los recién convocados. */
    public function callups(Request $request, Organization $organization, Event $event, OrgAccess $access): JsonResponse
    {
        $access->authorize($access->canWorkOnTeam($event->team));
        if ($event->status !== 'scheduled') {
            return ApiError::response('event_closed', 'Solo se convoca a actividades programadas.', 422);
        }
        $data = $request->validate([
            'players' => ['present', 'array', 'max:80'],
            'players.*.player_id' => ['required', 'integer', 'distinct'],
            'players.*.status' => ['sometimes', Rule::in(['called', 'reserve'])],
            'notify' => ['sometimes', 'boolean'],
        ]);
        $roster = TeamPlayer::where('team_id', $event->team_id)->where('active', true)->pluck('player_id')->map(fn ($i) => (int) $i)->all();
        $ids = array_map(fn ($p) => (int) $p['player_id'], $data['players']);
        if (array_diff($ids, $roster)) {
            return ApiError::response('validation_failed', 'Hay jugadores que no están activos en el equipo.', 422);
        }

        $previous = EventCallup::where('event_id', $event->id)->pluck('player_id')->map(fn ($i) => (int) $i)->all();
        DB::transaction(function () use ($event, $data, $ids) {
            EventCallup::where('event_id', $event->id)->whereNotIn('player_id', $ids ?: [0])->delete();
            foreach ($data['players'] as $p) {
                EventCallup::updateOrCreate(['event_id' => $event->id, 'player_id' => $p['player_id']], ['status' => $p['status'] ?? 'called']);
            }
        });

        $new = array_values(array_diff($ids, $previous));
        // En borrador se guarda sin avisar: el aviso sale al publicar.
        if ($new && ! $event->isDraft() && ($data['notify'] ?? true) && $event->starts_at->isFuture()) {
            $this->notifier->callups($event, $new);
        }
        Audit::log('event.callups_saved', $event, ['count' => count($ids)], $organization->id);

        return response()->json(['data' => ['count' => count($ids), 'newly_called' => $new]]);
    }

    /**
     * Guarda asistencia de los jugadores enviados (status null = quitar la marca).
     * En un partido publicado avisa a los padres de cada jugador cuyo estado cambió.
     */
    public function attendance(Request $request, Organization $organization, Event $event, OrgAccess $access): JsonResponse
    {
        $access->authorize($access->canWorkOnTeam($event->team));
        $data = $request->validate([
            'records' => ['required', 'array', 'max:80'],
            'records.*.player_id' => ['required', 'integer', 'distinct'],
            'records.*.status' => ['present', 'nullable', Rule::in(Attendance::STATUSES)],
            'records.*.note' => ['nullable', 'string', 'max:200'],
        ]);
        $roster = TeamPlayer::where('team_id', $event->team_id)->pluck('player_id')->map(fn ($i) => (int) $i)->all();
        foreach ($data['records'] as $r) {
            if (! in_array((int) $r['player_id'], $roster, true)) {
                return ApiError::response('validation_failed', 'Hay jugadores que no pertenecen al equipo.', 422);
            }
        }

        $changed = DB::transaction(function () use ($event, $data, $access) {
            $before = Attendance::where('event_id', $event->id)->lockForUpdate()->pluck('status', 'player_id');
            $changed = [];
            foreach ($data['records'] as $r) {
                $pid = (int) $r['player_id'];
                if ($r['status'] === null) {
                    Attendance::where('event_id', $event->id)->where('player_id', $pid)->delete();

                    continue;
                }
                Attendance::updateOrCreate(
                    ['event_id' => $event->id, 'player_id' => $pid],
                    ['status' => $r['status'], 'note' => $r['note'] ?? null, 'recorded_by' => $access->user->id],
                );
                if (($before[$pid] ?? null) !== $r['status']) {
                    $changed[] = $pid;
                }
            }

            return $changed;
        });

        $notified = 0;
        if ($changed) {
            // Lesión: siempre (partido o entreno, publicado o borrador). Lo demás: solo en partidos publicados.
            $notified = $this->notifier->attendance($event, $changed, ! ($event->type === 'match' && ! $event->isDraft()));
        }
        Audit::log('event.attendance_saved', $event, ['count' => count($data['records']), 'changed' => count($changed)], $organization->id);

        return response()->json(['data' => ['count' => count($data['records']), 'changed' => count($changed), 'notified' => $notified]]);
    }

    /** Ficha del partido al final. publish=true marca el partido como finalizado y avisa a los padres. */
    public function matchSheet(Request $request, Organization $organization, Event $event, OrgAccess $access, MatchSheetService $sheets): JsonResponse
    {
        $access->authorize($access->canWorkOnTeam($event->team));
        if ($event->type !== 'match') {
            return ApiError::response('not_a_match', 'La ficha solo aplica a partidos.', 422);
        }
        if ($event->status === 'cancelled') {
            return ApiError::response('event_closed', 'El partido está cancelado.', 422);
        }
        if ($event->isDraft()) {
            return ApiError::response('event_draft', 'Publique el partido antes de llenar la ficha.', 422);
        }

        $data = $request->validate([
            'score_us' => ['required', 'integer', 'min:0', 'max:999'],
            'score_them' => ['required', 'integer', 'min:0', 'max:999'],
            'publish' => ['sometimes', 'boolean'],
            'lineup' => ['present', 'array', 'max:80'],
            'lineup.*.player_id' => ['required', 'integer'],
            'lineup.*.is_starter' => ['sometimes', 'boolean'],
            'lineup.*.sport_position_id' => ['nullable', 'integer'],
            'lineup.*.jersey_number' => ['nullable', 'integer', 'min:0', 'max:999'],
            'lineup.*.minutes_played' => ['nullable', 'integer', 'min:0', 'max:600'],
            'actions' => ['present', 'array', 'max:500'],
            'actions.*.type' => ['sometimes', Rule::in(['stat', 'sub_in', 'sub_out', 'note'])],
            'actions.*.stat_code' => ['required_without:actions.*.type', 'nullable', 'string', 'max:30'],
            'actions.*.player_id' => ['nullable', 'integer'],
            'actions.*.related_player_id' => ['nullable', 'integer'],
            'actions.*.period' => ['nullable', 'integer', 'min:1', 'max:20'],
            'actions.*.minute' => ['nullable', 'integer', 'min:0', 'max:600'],
            'actions.*.value' => ['nullable', 'integer', 'min:1', 'max:99'],
            'actions.*.note' => ['nullable', 'string', 'max:200'],
            'shootout' => ['sometimes', 'nullable', 'array'],
            'shootout.score_us' => ['required_with:shootout', 'integer', 'min:0', 'max:99'],
            'shootout.score_them' => ['required_with:shootout', 'integer', 'min:0', 'max:99'],
            'shootout.kicks' => ['required_with:shootout', 'array', 'max:60'],
            'shootout.kicks.*.player_id' => ['required', 'integer'],
            'shootout.kicks.*.scored' => ['required', 'boolean'],
        ]);

        $result = $sheets->save($event, $data, $access->user);
        $event = $result['event'];

        if ($result['first_publish'] || $result['score_changed']) {
            $this->notifier->result($event, $result['score_changed']);
        }
        Audit::log('event.match_sheet_saved', $event, [
            'score' => "{$event->score_us}-{$event->score_them}", 'published' => (bool) $event->result_published_at,
        ], $organization->id);

        return response()->json(['data' => array_merge($event->payload(), ['warnings' => $result['warnings']])]);
    }

    /** Para publicar: fecha y hora siempre; en partidos además rival; en partidos y entrenos al menos un convocado. */
    private function publishProblems(string $type, $startsAt, ?string $opponent, int $callups, bool $timePending = false): ?JsonResponse
    {
        $fields = [];
        if (! $startsAt) {
            $fields['starts_at'] = ['La fecha es obligatoria para publicar.'];
        } elseif ($timePending) {
            $fields['starts_at'] = ['La hora es obligatoria para publicar.'];
        }
        if ($type === 'match' && blank($opponent)) {
            $fields['opponent_name'] = ['El rival es obligatorio para publicar.'];
        }
        if ($fields) {
            return ApiError::response('publish_incomplete', 'Para publicar complete: '.implode(' y ', array_map(fn ($f) => $f === 'starts_at' ? ($timePending && $startsAt ? 'la hora' : 'la fecha') : 'el rival', array_keys($fields))).'.', 422, ['fields' => $fields]);
        }
        if (in_array($type, ['match', 'training'], true) && $callups < 1) {
            return ApiError::response('callups_required', 'Para publicar convoque al menos a un jugador.', 422);
        }

        return null;
    }

    private function notOnRoster(int $teamId, array $players): ?JsonResponse
    {
        $roster = TeamPlayer::where('team_id', $teamId)->where('active', true)->pluck('player_id')->map(fn ($i) => (int) $i)->all();
        $ids = array_map(fn ($p) => (int) $p['player_id'], $players);

        return array_diff($ids, $roster) ? ApiError::response('validation_failed', 'Hay jugadores que no están activos en el equipo.', 422) : null;
    }

    private function rules(Organization $organization, bool $partial = false): array
    {
        $req = $partial ? 'sometimes' : 'required';

        return [
            'team_id' => [$req, 'integer', Rule::exists('teams', 'id')->where('organization_id', $organization->id)->whereNull('deleted_at')],
            'type' => [$req, Rule::in(['match', 'training', 'other'])],
            'title' => ['nullable', 'string', 'max:150'],
            'starts_at' => ['sometimes', 'nullable', 'date'],
            'time_pending' => ['sometimes', 'boolean'],
            'ends_at' => ['nullable', 'date', 'after:starts_at'],
            'location' => ['nullable', 'string', 'max:200'],
            'opponent_name' => ['nullable', 'string', 'max:120'],
            'home_away' => ['nullable', Rule::in(['home', 'away', 'neutral'])],
            'notes' => ['nullable', 'string', 'max:2000'],
        ];
    }
}
