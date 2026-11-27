<?php

namespace App\Services;

use App\Models\Event;
use App\Models\GuardianPlayer;
use App\Models\Player;
use App\Models\PlayerEventStat;
use App\Models\SportStatType;
use App\Models\TeamPlayer;
use Illuminate\Support\Facades\DB;

/** Avisos a padres relacionados con actividades del equipo. Textos con trato de usted. */
final class EventNotifier
{
    public function __construct(private NotificationService $notifications) {}

    /**
     * Convocatoria: un aviso por padre y partido. Si dos hijos suyos quedan convocados al mismo partido,
     * recibe UN aviso con ambos nombres. Cada hijo se avisa una sola vez por partido.
     */
    public function callups(Event $event, array $playerIds): void
    {
        $event->loadMissing('team');
        $players = Player::whereIn('id', $playerIds)->get()->keyBy('id');
        $byGuardian = GuardianPlayer::whereIn('player_id', $players->keys())
            ->whereHas('user', fn ($q) => $q->where('status', 'active'))->get()->groupBy('user_id');
        foreach ($byGuardian as $userId => $links) {
            $kids = $links->pluck('player_id')->unique()->sort()->values();
            // No repetir a un hijo ya avisado (p. ej. si se convocó antes por separado).
            $kids = $kids->reject(fn ($pid) => DB::table('notification_logs')->where('user_id', $userId)->where('kind', 'callup')
                ->where('ref_key', "event:{$event->id}:player:{$pid}")->exists())->values();
            if ($kids->isEmpty()) {
                continue;
            }
            $names = $kids->map(fn ($pid) => $players[$pid]->first_name)->all();
            $who = count($names) === 1 ? $names[0].' fue convocado(a)' : implode(' y ', $names).' fueron convocados';
            $sent = $this->notifications->notify(
                [$userId],
                'callup',
                "event:{$event->id}:players:".$kids->implode(','),
                'Convocatoria: '.$event->team->name,
                "{$who} para {$event->displayTitle()} el ".$this->when($event).'.',
                ['event_id' => $event->id, 'team_id' => $event->team_id, 'player_ids' => $kids->implode(','),
                    'child_name' => implode(' y ', $names)] + (count($names) === 1 ? ['player_id' => $kids[0]] : []),
                $event->organization_id,
                count($names) === 1 ? $kids[0] : null,
            );
            if ($sent) {
                foreach ($kids as $pid) {
                    DB::table('notification_logs')->insertOrIgnore(['user_id' => $userId, 'kind' => 'callup', 'ref_key' => "event:{$event->id}:player:{$pid}", 'sent_at' => now()]);
                }
            }
        }
    }

    /**
     * Entrenos programados (uno o una serie): UN aviso por padre de los convocados, sin nombres de jugadores.
     * "Se programaron 8 entrenos de Sub-12: lunes y miércoles, 5:30 p. m., del 2 de diciembre al 23 de diciembre."
     */
    public function trainingsScheduled(\Illuminate\Support\Collection $events, array $playerIds, string $refKey): int
    {
        $events = $events->sortBy('starts_at')->values();
        $first = $events->first();
        if (! $first || ! $playerIds) {
            return 0;
        }
        $first->loadMissing('team');
        $hora = $this->clock($first->starts_at);
        if ($events->count() === 1) {
            $body = "Se programó un entreno de {$first->team->name}: ".$first->starts_at->locale('es')->translatedFormat('l j \d\e F').", {$hora}"; // la hora ya termina en "a. m." / "p. m."
        } else {
            $names = [1 => 'lunes', 2 => 'martes', 3 => 'miércoles', 4 => 'jueves', 5 => 'viernes', 6 => 'sábado', 7 => 'domingo'];
            $days = $events->map(fn ($e) => $e->starts_at->isoWeekday())->unique()->sort()->map(fn ($d) => $names[$d])->values()->all();
            $dias = count($days) < 2 ? implode('', $days) : implode(', ', array_slice($days, 0, -1)).' y '.end($days);
            $d = fn ($e) => $e->starts_at->locale('es')->translatedFormat('j \d\e F');
            $body = "Se programaron {$events->count()} entrenos de {$first->team->name}: {$dias}, {$hora}, del {$d($first)} al {$d($events->last())}.";
        }

        return $this->notifications->notify(
            $this->guardiansOf($playerIds),
            'trainings',
            $refKey,
            'Entrenos: '.$first->team->name,
            $body,
            ['team_id' => $first->team_id, 'event_id' => $first->id, 'series_id' => $first->series_id, 'count' => $events->count()],
            $first->organization_id,
        );
    }

    private function clock(\DateTimeInterface $t): string
    {
        $c = \Illuminate\Support\Carbon::instance($t);

        return $c->format('g:i').($c->hour < 12 ? ' a. m.' : ' p. m.');
    }

    /** Cambio de fecha/lugar o cancelación: a los padres de toda la plantilla activa. */
    public function changed(Event $event, bool $cancelled): void
    {
        $event->loadMissing('team');
        $kind = $cancelled ? 'event_cancelled' : 'event_changed';
        $ref = "event:{$event->id}:".($cancelled ? 'cancelled' : $event->starts_at->format('YmdHi').':'.md5((string) $event->location));
        $body = $cancelled
            ? "Se canceló {$event->displayTitle()} del ".$this->when($event).'.'
            : "{$event->displayTitle()} cambió: ahora es el ".$this->when($event).($event->location ? " en {$event->location}" : '').'.';

        $this->notifications->notify(
            $this->guardiansOf($this->activeRoster($event)),
            $kind, $ref, $event->team->name, $body,
            ['event_id' => $event->id, 'team_id' => $event->team_id],
            $event->organization_id,
        );
    }

    /**
     * Resultado publicado: un aviso por jugador de la plantilla activa (personalizado si jugó).
     * Si se corrige la ficha sin cambiar el marcador, no se repite el aviso.
     */
    public function result(Event $event, bool $corrected): void
    {
        $event->loadMissing('team.sport');
        $score = "{$event->score_us}-{$event->score_them}".($event->shootout_us !== null ? "p{$event->shootout_us}-{$event->shootout_them}" : '');
        $headline = $event->team->name.' '.$event->score_us.'–'.$event->score_them.($event->opponent_name ? ' '.$event->opponent_name : '')
            .($event->shootout_us !== null ? " ({$event->shootout_us}–{$event->shootout_them} en penales)" : '');
        $names = SportStatType::where('sport_id', $event->team->sport_id)->pluck('name', 'code');
        $stats = PlayerEventStat::where('event_id', $event->id)->get()->keyBy('player_id');

        foreach (Player::whereIn('id', $this->activeRoster($event))->get() as $player) {
            $line = $headline.'.';
            if ($s = $stats->get($player->id)) {
                $parts = [];
                foreach ((array) $s->stats as $code => $n) {
                    if ($n > 0 && isset($names[$code])) {
                        $parts[] = $n.' '.mb_strtolower($names[$code]);
                    }
                }
                $line .= ' '.$player->first_name.($parts ? ': '.implode(', ', $parts) : ' jugó').($s->minutes_played ? " ({$s->minutes_played} min)" : '').'.';
            }

            $this->notifications->notify(
                $this->guardiansOf([$player->id]),
                'match_result',
                "event:{$event->id}:score:{$score}:player:{$player->id}",
                ($corrected ? 'Resultado corregido: ' : 'Resultado: ').$event->displayTitle(),
                $line,
                ['event_id' => $event->id, 'player_id' => $player->id, 'team_id' => $event->team_id],
                $event->organization_id,
                $player->id,
            );
        }
    }

    /**
     * Asistencia de un partido publicado: un aviso por jugador a sus padres ("Ana: Asiste").
     * Si se corrige, solo avisa a quienes les cambió el estado; volver a un estado anterior también avisa.
     */
    public function attendance(Event $event, array $playerIds): int
    {
        $event->loadMissing('team');
        $labels = ['present' => 'Asiste', 'excused' => 'No asiste (con aviso)', 'injured' => 'Lesión', 'absent' => 'No asiste (sin justificar)', 'late' => 'Llegó tarde'];
        $rows = \App\Models\Attendance::with('player')->where('event_id', $event->id)->whereIn('player_id', $playerIds)->get();
        $sent = 0;
        foreach ($rows as $a) {
            if (! $a->player || ! isset($labels[$a->status])) {
                continue;
            }
            $prefix = "event:{$event->id}:att:{$a->player_id}:";
            // Borra el registro de avisos de otros estados para que, si vuelve a cambiar, se avise de nuevo.
            \Illuminate\Support\Facades\DB::table('notification_logs')->where('kind', 'attendance')
                ->where('ref_key', 'like', $prefix.'%')->where('ref_key', '!=', $prefix.$a->status)->delete();
            $sent += $this->notifications->notify(
                $this->guardiansOf([$a->player_id]),
                'attendance',
                $prefix.$a->status,
                'Asistencia: '.$event->displayTitle(),
                "{$a->player->first_name}: {$labels[$a->status]}.",
                ['event_id' => $event->id, 'player_id' => $a->player_id, 'team_id' => $event->team_id, 'status' => $a->status],
                $event->organization_id,
                $a->player_id,
            );
        }

        return $sent;
    }

    private function activeRoster(Event $event): array
    {
        return TeamPlayer::where('team_id', $event->team_id)->where('active', true)->pluck('player_id')->all();
    }

    /**
     * Partido publicado: aviso opcional al staff suscrito (admins de la organización y super admins).
     * No avisa a quien lo publicó. Una sola vez por partido.
     */
    public function matchPublished(Event $event, ?int $actorId): int
    {
        $event->loadMissing('team', 'organization');
        $users = array_values(array_diff(\App\Support\StaffAlerts::recipients($event->organization_id), [(int) $actorId]));
        if (! $users) {
            return 0;
        }
        $called = \App\Models\EventCallup::where('event_id', $event->id)->count();

        return $this->notifications->notify(
            $users,
            'match_published',
            "event:{$event->id}:published",
            'Partido publicado: '.$event->displayTitle(),
            "{$event->organization->name}: {$this->when($event)}. Convocados: {$called}.",
            ['event_id' => $event->id, 'team_id' => $event->team_id],
            $event->organization_id,
        );
    }

    private function guardiansOf(array $playerIds): array
    {
        return GuardianPlayer::whereIn('player_id', $playerIds)
            ->whereHas('user', fn ($q) => $q->where('status', 'active'))
            ->pluck('user_id')->unique()->values()->all();
    }

    private function when(Event $event): string
    {
        return $event->starts_at->locale('es')->translatedFormat('l j \d\e F \a \l\a\s g:i a');
    }
}
