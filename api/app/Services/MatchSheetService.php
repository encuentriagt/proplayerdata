<?php

namespace App\Services;

use App\Models\Event;
use App\Models\MatchAction;
use App\Models\MatchLineup;
use App\Models\PlayerEventStat;
use App\Models\SportPosition;
use App\Models\SportStatType;
use App\Models\TeamPlayer;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Guarda la ficha completa del partido en una sola transacción (idempotente: guardar la misma ficha
 * dos veces deja exactamente el mismo resultado). Recalcula las estadísticas por jugador.
 */
final class MatchSheetService
{
    /** @return array{event: Event, warnings: string[], first_publish: bool, score_changed: bool} */
    public function save(Event $event, array $data, User $by): array
    {
        $event->loadMissing('team');
        $sportId = $event->team->sport_id;
        $rosterIds = TeamPlayer::where('team_id', $event->team_id)->pluck('player_id')->map(fn ($id) => (int) $id)->all();
        $statTypes = SportStatType::where('sport_id', $sportId)->get()->keyBy('code');
        // Posiciones de la organización en ese deporte; las borradas siguen valiendo para no bloquear fichas pasadas.
        $positionIds = SportPosition::withTrashed()->where('organization_id', $event->team->organization_id)->where('sport_id', $sportId)->pluck('id')->map(fn ($id) => (int) $id)->all();

        $lineup = collect($data['lineup'] ?? []);
        $actions = collect($data['actions'] ?? []);

        $errors = [];
        foreach ($lineup as $i => $row) {
            if (! in_array((int) $row['player_id'], $rosterIds, true)) {
                $errors["lineup.$i.player_id"] = 'El jugador no pertenece al equipo.';
            }
            if (! empty($row['sport_position_id']) && ! in_array((int) $row['sport_position_id'], $positionIds, true)) {
                $errors["lineup.$i.sport_position_id"] = 'La posición no es de su organización o no corresponde al deporte.';
            }
        }
        if ($lineup->pluck('player_id')->duplicates()->isNotEmpty()) {
            $errors['lineup'] = 'Hay jugadores repetidos en la alineación.';
        }
        foreach ($actions as $i => $a) {
            if (($a['type'] ?? 'stat') === 'stat' && ! $statTypes->has($a['stat_code'] ?? '')) {
                $errors["actions.$i.stat_code"] = 'Esa estadística no existe para este deporte.';
            }
            foreach (['player_id', 'related_player_id'] as $f) {
                if (! empty($a[$f]) && ! in_array((int) $a[$f], $rosterIds, true)) {
                    $errors["actions.$i.$f"] = 'El jugador no pertenece al equipo.';
                }
            }
        }
        if ($errors) {
            throw ValidationException::withMessages($errors);
        }

        // Una vez publicado, toda corrección se trata como publicación (si cambia el marcador, se avisa).
        $publish = (bool) ($data['publish'] ?? false) || $event->result_published_at !== null;
        $oldScore = [$event->score_us, $event->score_them];
        $firstPublish = $publish && ! $event->result_published_at;

        DB::transaction(function () use ($event, $data, $lineup, $actions, $statTypes, $by, $publish) {
            $locked = Event::whereKey($event->id)->lockForUpdate()->first();

            MatchLineup::where('event_id', $event->id)->delete();
            MatchAction::where('event_id', $event->id)->delete();
            PlayerEventStat::where('event_id', $event->id)->delete();

            $now = now();
            MatchLineup::insert($lineup->map(fn ($r) => [
                'event_id' => $event->id, 'player_id' => (int) $r['player_id'],
                'is_starter' => (bool) ($r['is_starter'] ?? false),
                'sport_position_id' => $r['sport_position_id'] ?? null,
                'jersey_number' => $r['jersey_number'] ?? null,
                'minutes_played' => $r['minutes_played'] ?? null,
                'created_at' => $now, 'updated_at' => $now,
            ])->all());

            MatchAction::insert($actions->map(fn ($a) => [
                'event_id' => $event->id,
                'type' => $a['type'] ?? 'stat',
                'sport_stat_type_id' => ($a['type'] ?? 'stat') === 'stat' ? $statTypes[$a['stat_code']]->id : null,
                'player_id' => $a['player_id'] ?? null,
                'related_player_id' => $a['related_player_id'] ?? null,
                'period' => $a['period'] ?? null,
                'minute' => $a['minute'] ?? null,
                'value' => $a['value'] ?? 1,
                'note' => $a['note'] ?? null,
                'recorded_by' => $by->id,
                'created_at' => $now, 'updated_at' => $now,
            ])->all());

            // Estadísticas por jugador = suma de acciones "stat" + minutos de la alineación.
            $per = [];
            foreach ($lineup as $r) {
                $per[(int) $r['player_id']] = ['minutes' => $r['minutes_played'] ?? null, 'stats' => []];
            }
            foreach ($actions as $a) {
                if (($a['type'] ?? 'stat') !== 'stat' || empty($a['player_id'])) {
                    continue;
                }
                $pid = (int) $a['player_id'];
                $per[$pid] ??= ['minutes' => null, 'stats' => []];
                $per[$pid]['stats'][$a['stat_code']] = ($per[$pid]['stats'][$a['stat_code']] ?? 0) + (int) ($a['value'] ?? 1);
            }
            PlayerEventStat::insert(collect($per)->map(fn ($v, $pid) => [
                'event_id' => $event->id, 'player_id' => $pid, 'minutes_played' => $v['minutes'],
                'stats' => json_encode((object) $v['stats']), 'created_at' => $now, 'updated_at' => $now,
            ])->values()->all());

            $locked->forceFill([
                'score_us' => $data['score_us'],
                'score_them' => $data['score_them'],
                'status' => $publish ? 'finished' : $locked->status,
                'result_published_at' => $publish ? ($locked->result_published_at ?? now()) : $locked->result_published_at,
            ])->save();
        });

        $event->refresh();

        // Aviso (no bloquea): la suma de lo que anotaron nuestros jugadores no coincide con el marcador.
        $warnings = [];
        $scored = $actions->filter(fn ($a) => ($a['type'] ?? 'stat') === 'stat' && ($statTypes[$a['stat_code']]->scores ?? 0) > 0 && $a['stat_code'] !== 'own_goal')
            ->sum(fn ($a) => $statTypes[$a['stat_code']]->scores * (int) ($a['value'] ?? 1));
        if ($actions->isNotEmpty() && $scored !== (int) $event->score_us) {
            $warnings[] = "La suma de anotaciones de sus jugadores ({$scored}) no coincide con el marcador ({$event->score_us}).";
        }

        return [
            'event' => $event,
            'warnings' => $warnings,
            'first_publish' => $firstPublish,
            'score_changed' => $publish && ! $firstPublish && $oldScore !== [$event->score_us, $event->score_them],
        ];
    }
}
