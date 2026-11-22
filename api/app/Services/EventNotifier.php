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
