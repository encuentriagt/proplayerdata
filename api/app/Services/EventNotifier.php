<?php

namespace App\Services;

use App\Models\Event;
use App\Models\GuardianPlayer;
use App\Models\Player;
use App\Models\PlayerEventStat;
use App\Models\SportStatType;
use App\Models\TeamPlayer;

/** Avisos a padres relacionados con actividades del equipo. Textos con trato de usted. */
final class EventNotifier
{
    public function __construct(private NotificationService $notifications) {}

    /** Convocatoria: un aviso por jugador convocado (una sola vez por partido). */
    public function callups(Event $event, array $playerIds): void
    {
        $event->loadMissing('team');
        foreach (Player::whereIn('id', $playerIds)->get() as $player) {
            $this->notifications->notify(
                $this->guardiansOf([$player->id]),
                'callup',
                "event:{$event->id}:player:{$player->id}",
                'Convocatoria: '.$event->team->name,
                "{$player->first_name} fue convocado(a) para {$event->displayTitle()} el ".$this->when($event).'.',
                ['event_id' => $event->id, 'player_id' => $player->id, 'team_id' => $event->team_id],
                $event->organization_id,
                $player->id,
            );
        }
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
        $score = "{$event->score_us}-{$event->score_them}";
        $headline = $event->team->name.' '.$event->score_us.' - '.$event->score_them.($event->opponent_name ? ' '.$event->opponent_name : '');
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
        $labels = ['present' => 'Asiste', 'excused' => 'No asiste (con aviso)', 'injured' => 'Lesión', 'absent' => 'No asiste (sin justificar)'];
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
