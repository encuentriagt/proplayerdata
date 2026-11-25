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
        ]);
        $pending = $request->boolean('pending_sheet');
        if ($pending) {
            // Partidos ya jugados (últimos 120 días), no cancelados y sin resultado publicado.
            $from = CarbonImmutable::now()->subDays(120)->startOfDay();
            $to = CarbonImmutable::now();
        } else {
            $from = CarbonImmutable::parse($data['from'] ?? now()->startOfMonth())->startOfDay();
            $to = CarbonImmutable::parse($data['to'] ?? $from->addDays(41))->endOfDay();
            if ($from->diffInDays($to) > 120) {
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
        $data['attendance'] = $event->attendances->map(fn ($a) => [
            'player_id' => $a->player_id, 'player_name' => $a->player?->fullName(), 'status' => $a->status, 'note' => $a->note,
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
        ]));
        $team = Team::where('organization_id', $organization->id)->findOrFail($data['team_id']);
        $access->authorize($access->canWorkOnTeam($team));
        $publish = $data['publish'] ?? true;
        $callups = $data['callups'] ?? null;
        unset($data['publish'], $data['callups']);
        if ($callups !== null && ($bad = $this->notOnRoster($team->id, $callups))) {
            return $bad;
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
            $this->notifier->callups($event, array_map(fn ($p) => (int) $p['player_id'], $callups));
        }
        Audit::log('event.created', $event, ['type' => $event->type, 'team_id' => $team->id, 'draft' => ! $publish], $organization->id);

        return response()->json(['data' => $event->load('team:id,name')->payload()], 201);
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

        $before = [$event->starts_at?->format('YmdHi'), $event->location, $event->status];
        $event->update($data);
        $after = [$event->starts_at?->format('YmdHi'), $event->location, $event->status];

        $cancelled = $event->status === 'cancelled' && $before[2] !== 'cancelled';
        $moved = ! $cancelled && $event->status === 'scheduled' && ($before[0] !== $after[0] || $before[1] !== $after[1]) && $event->starts_at->isFuture();
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

    /** Guarda asistencia (reemplaza los registros enviados). */
    public function attendance(Request $request, Organization $organization, Event $event, OrgAccess $access): JsonResponse
    {
        $access->authorize($access->canWorkOnTeam($event->team));
        $data = $request->validate([
            'records' => ['required', 'array', 'max:80'],
            'records.*.player_id' => ['required', 'integer', 'distinct'],
            'records.*.status' => ['required', Rule::in(['present', 'absent', 'late', 'excused'])],
            'records.*.note' => ['nullable', 'string', 'max:200'],
        ]);
        $roster = TeamPlayer::where('team_id', $event->team_id)->pluck('player_id')->map(fn ($i) => (int) $i)->all();
        foreach ($data['records'] as $r) {
            if (! in_array((int) $r['player_id'], $roster, true)) {
                return ApiError::response('validation_failed', 'Hay jugadores que no pertenecen al equipo.', 422);
            }
        }

        DB::transaction(function () use ($event, $data, $access) {
            foreach ($data['records'] as $r) {
                Attendance::updateOrCreate(
                    ['event_id' => $event->id, 'player_id' => $r['player_id']],
                    ['status' => $r['status'], 'note' => $r['note'] ?? null, 'recorded_by' => $access->user->id],
                );
            }
        });
        Audit::log('event.attendance_saved', $event, ['count' => count($data['records'])], $organization->id);

        return response()->json(['data' => ['count' => count($data['records'])]]);
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
            'starts_at' => [$req, 'date'],
            'ends_at' => ['nullable', 'date', 'after:starts_at'],
            'location' => ['nullable', 'string', 'max:200'],
            'opponent_name' => ['nullable', 'string', 'max:120'],
            'home_away' => ['nullable', Rule::in(['home', 'away', 'neutral'])],
            'notes' => ['nullable', 'string', 'max:2000'],
        ];
    }
}
