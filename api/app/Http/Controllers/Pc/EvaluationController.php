<?php

namespace App\Http\Controllers\Pc;

use App\Http\Controllers\Controller;
use App\Models\Organization;
use App\Models\Player;
use App\Models\Team;
use App\Models\TeamPlayer;
use App\Support\ApiError;
use App\Support\Audit;
use App\Support\Evaluation;
use App\Support\OrgAccess;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/** Evaluación del coach (radar 0–100) por deporte. Puede evaluar quien trabaja con un equipo del jugador en ese deporte. */
class EvaluationController extends Controller
{
    public function show(Request $request, Organization $organization, Player $player, OrgAccess $access): JsonResponse
    {
        $access->authorize($access->canViewPlayer($player));
        $data = $request->validate(['sport_id' => ['required', 'integer']]);

        return response()->json(['data' => Evaluation::payload($player->id, (int) $data['sport_id']) + [
            'catalog' => Evaluation::catalog(), 'can_edit' => $this->canEdit($access, $player, (int) $data['sport_id']),
        ]]);
    }

    public function update(Request $request, Organization $organization, Player $player, OrgAccess $access): JsonResponse
    {
        $rules = ['sport_id' => ['required', 'integer'], 'attributes' => ['required', 'array']];
        foreach (array_keys(Evaluation::ATTRIBUTES) as $c) {
            $rules["attributes.$c"] = ['required', 'integer', 'min:0', 'max:100'];
        }
        $data = $request->validate($rules);
        $sportId = (int) $data['sport_id'];
        if (! TeamPlayer::where('player_id', $player->id)->whereHas('team', fn ($q) => $q->where('sport_id', $sportId))->exists()) {
            return ApiError::response('validation_failed', 'El jugador no está en un equipo de ese deporte.', 422, ['fields' => ['sport_id' => ['Deporte no válido para el jugador.']]]);
        }
        $access->authorize($this->canEdit($access, $player, $sportId));

        $values = array_map('intval', array_intersect_key($data['attributes'], Evaluation::ATTRIBUTES));
        $row = ['organization_id' => $organization->id, 'attributes' => json_encode($values), 'evaluated_by' => $access->user->id, 'updated_at' => now()];
        $key = ['player_id' => $player->id, 'sport_id' => $sportId];
        DB::table('player_evaluations')->where($key)->exists()
            ? DB::table('player_evaluations')->where($key)->update($row)
            : DB::table('player_evaluations')->insert($key + $row + ['created_at' => now()]);
        Audit::log('player.evaluated', $player, ['sport_id' => $sportId], $organization->id);

        return response()->json(['data' => Evaluation::payload($player->id, $sportId) + ['catalog' => Evaluation::catalog(), 'can_edit' => true]]);
    }

    /** Coach o director que trabaja con algún equipo del jugador en ese deporte; admin siempre. */
    private function canEdit(OrgAccess $access, Player $player, int $sportId): bool
    {
        if ($player->organization_id !== $access->organization->id) {
            return false;
        }
        if ($access->isAdmin()) {
            return true;
        }
        $teamIds = TeamPlayer::where('player_id', $player->id)->pluck('team_id');

        return Team::whereIn('id', $teamIds)->where('sport_id', $sportId)->whereIn('id', $access->teamIds() ?: [0])->exists();
    }
}
