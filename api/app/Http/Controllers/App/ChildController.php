<?php

namespace App\Http\Controllers\App;

use App\Http\Controllers\Controller;
use App\Models\Attendance;
use App\Models\Event;
use App\Models\EventCallup;
use App\Models\GuardianPlayer;
use App\Models\MatchLineup;
use App\Models\Player;
use App\Models\PlayerEventStat;
use App\Models\SportStatType;
use App\Models\TeamPlayer;
use App\Services\PlanService;
use App\Support\ApiError;
use App\Support\Audit;
use Carbon\CarbonImmutable;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/**
 * API de la App de padres. Un padre solo ve a SUS hijos y solo los datos de su hijo
 * (no los de otros jugadores). Los límites dependen del plan (config/plans.php). Nunca se mencionan precios.
 */
class ChildController extends Controller
{
    public function __construct(private PlanService $plans) {}

    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $grant = $this->plans->activeGrant($user);
        $children = $user->children()->with('organization')->whereHas('organization', fn ($q) => $q->where('status', 'active'))->get();

        return response()->json(['data' => $children->map(function (Player $p) use ($user, $grant) {
            $teams = TeamPlayer::with(['team.sport', 'team.season', 'position'])->where('player_id', $p->id)->where('active', true)->get()
                ->filter(fn ($r) => $r->team)->map(fn ($r) => [
                    'id' => $r->team->id, 'name' => $r->team->name, 'category' => $r->team->category,
                    'sport' => ['id' => $r->team->sport->id, 'code' => $r->team->sport->code, 'name' => $r->team->sport->name],
                    'season' => $r->team->season ? ['id' => $r->team->season->id, 'name' => $r->team->season->name] : null,
                    'jersey_number' => $r->jersey_number,
                    'position' => $r->position ? ['id' => $r->position->id, 'name' => $r->position->name] : null,
                ])->values();
            $level = $this->plans->levelFor($user, $p, $grant);

            return [
                'id' => $p->id, 'first_name' => $p->first_name, 'last_name' => $p->last_name,
                'photo_url' => $p->photoUrl(),
                'organization' => ['id' => $p->organization->id] + $p->organization->brandingPayload(),
                'birthdate' => $p->birthdate?->toDateString(),
                'teams' => $teams,
                'plan_level' => $level,
            ];
        })->values()]);
    }

    /** ?from=&to= (máx. 120 días). En Gratis, el pasado se limita a history_days. */
    public function events(Request $request, Player $player): JsonResponse
    {
        [$level, $limits] = $this->authorizeChild($request, $player);
        $data = $request->validate(['from' => ['nullable', 'date'], 'to' => ['nullable', 'date', 'after_or_equal:from'],
            'sport_id' => ['nullable', 'integer'], 'team_id' => ['nullable', 'integer'], 'type' => ['nullable', Rule::in(['match', 'training', 'other'])]]);
        $from = CarbonImmutable::parse($data['from'] ?? now()->startOfMonth())->startOfDay();
        $to = CarbonImmutable::parse($data['to'] ?? $from->addDays(41))->endOfDay();
        if ($from->diffInDays($to) > 120) {
            return ApiError::response('range_too_large', 'El rango máximo es de 120 días.', 422);
        }
        $limited = false;
        if ($limits['history_days'] !== null) {
            $min = CarbonImmutable::now()->subDays($limits['history_days'])->startOfDay();
            if ($from->lt($min)) {
                $from = $min;
                $limited = true;
            }
        }

        $teamIds = TeamPlayer::where('player_id', $player->id)->pluck('team_id');
        $events = Event::with('team:id,name,sport_id')->published()->whereIn('team_id', $teamIds)
            ->when($data['team_id'] ?? null, fn ($q, $t) => $q->where('team_id', $t))
            ->when($data['sport_id'] ?? null, fn ($q, $s) => $q->whereHas('team', fn ($t) => $t->where('sport_id', $s)))
            ->when($data['type'] ?? null, fn ($q, $t) => $q->where('type', $t))
            ->whereBetween('starts_at', [$from, max($from, $to)])->orderBy('starts_at')->get();
        $callups = EventCallup::where('player_id', $player->id)->whereIn('event_id', $events->pluck('id'))->get()->keyBy('event_id');

        return response()->json([
            'data' => $events->map(fn (Event $e) => array_merge($this->publicEvent($e), [
                'callup' => ($c = $callups->get($e->id)) ? ['status' => $c->status, 'response' => $c->guardian_response] : null,
            ]))->values(),
            'meta' => ['plan_level' => $level, 'history_limited' => $limited],
        ]);
    }

    /**
     * Calendario unificado: eventos publicados de TODOS los hijos (todas sus organizaciones) en un llamado.
     * Un evento con dos hijos viene una sola vez, con children[] y child_ids[]. En Gratis, el pasado se
     * limita por hijo (history_days de cada uno).
     */
    public function calendar(Request $request): JsonResponse
    {
        $data = $request->validate(['from' => ['nullable', 'date'], 'to' => ['nullable', 'date', 'after_or_equal:from'],
            'child_id' => ['nullable', 'integer'], 'sport_id' => ['nullable', 'integer'], 'type' => ['nullable', Rule::in(['match', 'training', 'other'])]]);
        $from = CarbonImmutable::parse($data['from'] ?? now()->startOfMonth())->startOfDay();
        $to = CarbonImmutable::parse($data['to'] ?? $from->addDays(41))->endOfDay();
        if ($from->diffInDays($to) > 120) {
            return ApiError::response('range_too_large', 'El rango máximo es de 120 días.', 422);
        }
        $user = $request->user();
        $grant = $this->plans->activeGrant($user);
        $children = $user->children()->with('organization')->whereHas('organization', fn ($q) => $q->where('status', 'active'))
            ->when($data['child_id'] ?? null, fn ($q, $c) => $q->where('players.id', $c))->get();
        if (! empty($data['child_id']) && $children->isEmpty()) {
            throw new AuthorizationException;
        }

        // Por hijo: equipos y fecha mínima según su plan.
        $limited = false;
        $info = $children->mapWithKeys(function (Player $p) use ($user, $grant, $from, &$limited) {
            $limits = $this->plans->limits($this->plans->levelFor($user, $p, $grant));
            $min = $limits['history_days'] !== null ? CarbonImmutable::now()->subDays($limits['history_days'])->startOfDay() : null;
            if ($min && $from->lt($min)) {
                $limited = true;
            }

            return [$p->id => ['player' => $p, 'teams' => TeamPlayer::where('player_id', $p->id)->pluck('team_id')->all(), 'min' => $min]];
        });
        $teamIds = $info->flatMap(fn ($i) => $i['teams'])->unique()->values();

        $events = Event::with(['team.sport', 'organization'])->published()->whereIn('team_id', $teamIds->all() ?: [0])
            ->when($data['sport_id'] ?? null, fn ($q, $s) => $q->whereHas('team', fn ($t) => $t->where('sport_id', $s)))
            ->when($data['type'] ?? null, fn ($q, $t) => $q->where('type', $t))
            ->whereBetween('starts_at', [$from, max($from, $to)])->orderBy('starts_at')->limit(500)->get();
        $callups = EventCallup::whereIn('event_id', $events->pluck('id'))->whereIn('player_id', $info->keys())->get()
            ->groupBy(fn ($c) => $c->event_id.':'.$c->player_id);

        $out = [];
        foreach ($events as $e) {
            $kids = $info->filter(fn ($i) => in_array($e->team_id, $i['teams']) && (! $i['min'] || $e->starts_at->gte($i['min'])));
            if ($kids->isEmpty()) {
                continue;
            }
            $out[] = array_merge($this->publicEvent($e), [
                'team' => ['id' => $e->team->id, 'name' => $e->team->name],
                'sport' => ['id' => $e->team->sport->id, 'code' => $e->team->sport->code, 'name' => $e->team->sport->name],
                'organization' => ['id' => $e->organization->id, 'name' => $e->organization->name],
                'child_ids' => $kids->keys()->values()->all(),
                'children' => $kids->map(function ($i) use ($e, $callups) {
                    $c = $callups->get($e->id.':'.$i['player']->id)?->first();

                    return ['child_id' => $i['player']->id, 'first_name' => $i['player']->first_name,
                        'callup' => $c ? ['status' => $c->status, 'response' => $c->guardian_response] : null];
                })->values()->all(),
            ]);
        }

        return response()->json(['data' => $out, 'meta' => ['history_limited' => $limited]]);
    }

    public function event(Request $request, Player $player, int $eventId): JsonResponse
    {
        [$level, $limits] = $this->authorizeChild($request, $player);
        $event = $this->childEvent($player, $eventId);
        if ($limits['history_days'] !== null && $event->starts_at->lt(now()->subDays($limits['history_days'])->startOfDay())) {
            return ApiError::response('plan_limit', 'Esta información tiene un límite en su plan actual. Consulte con su institución.', 403);
        }

        $callup = EventCallup::where('event_id', $event->id)->where('player_id', $player->id)->first();
        $att = Attendance::where('event_id', $event->id)->where('player_id', $player->id)->first();
        $lineup = MatchLineup::where('event_id', $event->id)->where('player_id', $player->id)->first();
        $stat = PlayerEventStat::where('event_id', $event->id)->where('player_id', $player->id)->first();

        return response()->json(['data' => array_merge($this->publicEvent($event), [
            'callup' => $callup ? ['status' => $callup->status, 'response' => $callup->guardian_response] : null,
            'attendance' => $att ? ['status' => $att->status, 'note' => $att->note] : null,
            'child_played' => $lineup ? ['is_starter' => $lineup->is_starter, 'minutes_played' => $lineup->minutes_played] : null,
            'child_stats' => $event->result_published_at && $stat ? $this->namedStats($event->team->sport_id, (array) $stat->stats) : null,
        ]), 'meta' => ['plan_level' => $level]]);
    }

    /** El padre confirma o declina la convocatoria (antes del partido). Idempotente. */
    public function respondCallup(Request $request, Player $player, int $eventId): JsonResponse
    {
        $this->authorizeChild($request, $player);
        $data = $request->validate(['response' => ['required', Rule::in(['confirmed', 'declined'])]]);
        $event = $this->childEvent($player, $eventId);

        $callup = EventCallup::where('event_id', $event->id)->where('player_id', $player->id)->first();
        if (! $callup) {
            return ApiError::response('not_called', 'Su hijo(a) no está convocado(a) para esta actividad.', 422);
        }
        if ($event->status !== 'scheduled' || $event->starts_at->isPast()) {
            return ApiError::response('event_closed', 'Ya no se puede responder a esta convocatoria.', 422);
        }

        $callup->update(['guardian_response' => $data['response'], 'responded_by' => $request->user()->id, 'responded_at' => now()]);
        Audit::log('callup.responded', $callup, ['response' => $data['response']], $event->organization_id);

        return response()->json(['data' => ['status' => $callup->status, 'response' => $callup->guardian_response]]);
    }

    /** Estadísticas acumuladas del hijo (por temporada/equipo). En Gratis: últimos N partidos. */
    public function stats(Request $request, Player $player): JsonResponse
    {
        [$level, $limits] = $this->authorizeChild($request, $player);
        $request->validate(['team_id' => ['nullable', 'integer']]);

        $q = PlayerEventStat::query()->where('player_id', $player->id)
            ->whereHas('event', fn ($e) => $e->whereNotNull('result_published_at')
                ->when($request->integer('team_id'), fn ($w, $t) => $w->where('team_id', $t)))
            ->with('event.team:id,name,sport_id')
            ->join('events', 'events.id', '=', 'player_event_stats.event_id')
            ->orderByDesc('events.starts_at')->select('player_event_stats.*');
        if ($limits['stats_last_matches'] !== null) {
            $q->limit($limits['stats_last_matches']);
        }
        $rows = $q->get();

        $bySport = [];
        foreach ($rows as $r) {
            $sid = $r->event->team->sport_id;
            $bySport[$sid] ??= ['matches' => 0, 'minutes' => 0, 'stats' => []];
            $bySport[$sid]['matches']++;
            $bySport[$sid]['minutes'] += (int) $r->minutes_played;
            foreach ((array) $r->stats as $code => $n) {
                $bySport[$sid]['stats'][$code] = ($bySport[$sid]['stats'][$code] ?? 0) + (int) $n;
            }
        }

        $att = Attendance::where('player_id', $player->id)
            ->whereHas('event', fn ($e) => $e->whereNotNull('published_at'))
            ->when($limits['history_days'] !== null, fn ($w) => $w->whereHas('event', fn ($e) => $e->where('starts_at', '>=', now()->subDays($limits['history_days']))))
            ->select('status', DB::raw('count(*) as n'))->groupBy('status')->pluck('n', 'status');

        return response()->json(['data' => [
            'by_sport' => collect($bySport)->map(fn ($v, $sid) => [
                'sport_id' => $sid, 'matches' => $v['matches'], 'minutes' => $v['minutes'],
                'stats' => $this->namedStats($sid, $v['stats']),
            ])->values(),
            'attendance' => ['present' => (int) ($att['present'] ?? 0), 'excused' => (int) ($att['excused'] ?? 0), 'injured' => (int) ($att['injured'] ?? 0), 'absent' => (int) ($att['absent'] ?? 0)],
        ], 'meta' => ['plan_level' => $level, 'limited' => $limits['stats_last_matches'] !== null]]);
    }

    // ---- ayudas ----

    /** @return array{0:string,1:array} */
    private function authorizeChild(Request $request, Player $player): array
    {
        $user = $request->user();
        $linked = GuardianPlayer::where('user_id', $user->id)->where('player_id', $player->id)->exists();
        if (! $linked || ! $player->organization?->isActive()) {
            throw new AuthorizationException;
        }
        $level = $this->plans->levelFor($user, $player);

        return [$level, $this->plans->limits($level)];
    }

    private function childEvent(Player $player, int $eventId): Event
    {
        $teamIds = TeamPlayer::where('player_id', $player->id)->pluck('team_id');

        return Event::with('team.sport')->published()->whereIn('team_id', $teamIds)->findOrFail($eventId);
    }

    private function publicEvent(Event $e): array
    {
        $p = $e->payload();
        unset($p['notes']); // notas internas del staff
        if (! $e->result_published_at) {
            $p['score_us'] = null;
            $p['score_them'] = null;
        }

        return $p;
    }

    private function namedStats(int $sportId, array $stats): array
    {
        $types = SportStatType::where('sport_id', $sportId)->orderBy('sort')->get(['code', 'name']);

        return $types->filter(fn ($t) => isset($stats[$t->code]))
            ->map(fn ($t) => ['code' => $t->code, 'name' => $t->name, 'value' => (int) $stats[$t->code]])->values()->all();
    }
}
