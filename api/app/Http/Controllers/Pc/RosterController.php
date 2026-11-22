<?php

namespace App\Http\Controllers\Pc;

use App\Http\Controllers\Controller;
use App\Models\Organization;
use App\Models\Player;
use App\Models\SportPosition;
use App\Models\Team;
use App\Models\TeamPlayer;
use App\Support\Audit;
use App\Support\OrgAccess;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/** Plantilla de un equipo: agregar, editar dorsal/posición, quitar. */
class RosterController extends Controller
{
    public function index(Organization $organization, Team $team, OrgAccess $access): JsonResponse
    {
        $access->authorize($access->canViewTeam($team));

        $rows = TeamPlayer::with(['player', 'position'])->where('team_id', $team->id)
            ->whereHas('player')->get()
            ->sortBy(fn ($r) => [$r->active ? 0 : 1, $r->jersey_number ?? 9999, $r->player->last_name])->values();

        return response()->json(['data' => $rows->map(fn (TeamPlayer $r) => array_merge($r->player->payload(), [
            'jersey_number' => $r->jersey_number,
            'position' => $r->position ? ['id' => $r->position->id, 'code' => $r->position->code, 'name' => $r->position->name] : null,
            'active' => $r->active,
        ]))]);
    }

    public function store(Request $request, Organization $organization, Team $team, OrgAccess $access): JsonResponse
    {
        $access->authorize($access->canWorkOnTeam($team));
        $data = $request->validate([
            'player_id' => ['required', 'integer', Rule::exists('players', 'id')->where('organization_id', $organization->id)->whereNull('deleted_at')],
            'jersey_number' => ['nullable', 'integer', 'min:0', 'max:999'],
            'sport_position_id' => ['nullable', 'integer'],
        ]);
        $player = Player::findOrFail($data['player_id']);
        // Un coach solo puede agregar jugadores que ya ve (de sus equipos); el admin/director, cualquiera de la organización.
        $access->authorize($access->seesAllTeams() || $access->canViewPlayer($player));
        $this->assertPosition($team, $data['sport_position_id'] ?? null);

        $row = TeamPlayer::updateOrCreate(
            ['team_id' => $team->id, 'player_id' => $player->id],
            ['jersey_number' => $data['jersey_number'] ?? null, 'sport_position_id' => $data['sport_position_id'] ?? null, 'active' => true],
        );
        Audit::log('roster.added', $team, ['player_id' => $player->id], $organization->id);

        return response()->json(['data' => ['team_id' => $team->id, 'player_id' => $row->player_id, 'jersey_number' => $row->jersey_number, 'active' => true]], 201);
    }

    public function update(Request $request, Organization $organization, Team $team, int $playerId, OrgAccess $access): JsonResponse
    {
        $access->authorize($access->canWorkOnTeam($team));
        $data = $request->validate([
            'jersey_number' => ['sometimes', 'nullable', 'integer', 'min:0', 'max:999'],
            'sport_position_id' => ['sometimes', 'nullable', 'integer'],
            'active' => ['sometimes', 'boolean'],
        ]);
        $this->assertPosition($team, $data['sport_position_id'] ?? null);
        $row = TeamPlayer::where('team_id', $team->id)->where('player_id', $playerId)->firstOrFail();
        $row->update($data);
        Audit::log('roster.updated', $team, ['player_id' => $playerId], $organization->id);

        return response()->json(['data' => ['team_id' => $team->id, 'player_id' => $playerId, 'jersey_number' => $row->jersey_number, 'active' => $row->active]]);
    }

    public function destroy(Organization $organization, Team $team, int $playerId, OrgAccess $access): JsonResponse
    {
        $access->authorize($access->canWorkOnTeam($team));
        TeamPlayer::where('team_id', $team->id)->where('player_id', $playerId)->delete();
        Audit::log('roster.removed', $team, ['player_id' => $playerId], $organization->id);

        return response()->json(['data' => ['ok' => true]]);
    }

    private function assertPosition(Team $team, ?int $positionId): void
    {
        if ($positionId && ! SportPosition::where('id', $positionId)->where('sport_id', $team->sport_id)->exists()) {
            throw ValidationException::withMessages(['sport_position_id' => 'La posición no corresponde al deporte del equipo.']);
        }
    }
}
