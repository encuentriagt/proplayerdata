<?php

namespace App\Http\Controllers\Pc;

use App\Http\Controllers\Controller;
use App\Models\Organization;
use App\Models\Team;
use App\Support\Audit;
use App\Support\OrgAccess;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class TeamController extends Controller
{
    /** Equipos visibles: admin y director ven todos; coach solo los asignados. ?sport_id= filtra. */
    public function index(Request $request, Organization $organization, OrgAccess $access): JsonResponse
    {
        $teams = Team::with(['sport', 'season'])
            ->whereIn('id', $access->teamIds())
            ->when($request->integer('sport_id'), fn ($q, $s) => $q->where('sport_id', $s))
            ->orderBy('name')
            ->get();

        return response()->json(['data' => $teams->map->payload()->values()]);
    }

    public function show(Organization $organization, Team $team, OrgAccess $access): JsonResponse
    {
        $access->authorize($access->canViewTeam($team));
        $team->load(['sport.positions', 'sport.statTypes', 'season']);

        $data = $team->payload();
        $data['sport'] = $team->sport->payload();
        $data['staff'] = $team->staff()->with('user:id,name,email')->get()->map(fn ($s) => [
            'user_id' => $s->user_id, 'name' => $s->user?->name, 'role' => $s->role,
        ]);

        return response()->json(['data' => $data]);
    }

    public function store(Request $request, Organization $organization, OrgAccess $access): JsonResponse
    {
        $access->authorize($access->isAdmin());
        $data = $this->validated($request, $organization);

        $team = $organization->teams()->create($data);
        Audit::log('team.created', $team, ['name' => $team->name], $organization->id);

        return response()->json(['data' => $team->load(['sport', 'season'])->payload()], 201);
    }

    public function update(Request $request, Organization $organization, Team $team, OrgAccess $access): JsonResponse
    {
        $access->authorize($access->isAdmin());
        $data = $this->validated($request, $organization, true);

        if (isset($data['sport_id']) && (int) $data['sport_id'] !== $team->sport_id && $team->roster()->exists()) {
            return response()->json(['error' => ['code' => 'sport_locked', 'message' => 'No se puede cambiar el deporte de un equipo que ya tiene jugadores.']], 422);
        }

        $team->update($data);
        Audit::log('team.updated', $team, array_keys($data), $organization->id);

        return response()->json(['data' => $team->fresh(['sport', 'season'])->payload()]);
    }

    public function destroy(Organization $organization, Team $team, OrgAccess $access): JsonResponse
    {
        $access->authorize($access->isAdmin());
        $team->delete();
        Audit::log('team.deleted', $team, [], $organization->id);

        return response()->json(['data' => ['ok' => true]]);
    }

    private function validated(Request $request, Organization $organization, bool $partial = false): array
    {
        $req = $partial ? 'sometimes' : 'required';

        return $request->validate([
            'name' => [$req, 'string', 'min:2', 'max:100'],
            'sport_id' => [$req, 'integer', Rule::exists('sports', 'id')->where('active', true)],
            'season_id' => ['nullable', 'integer', Rule::exists('seasons', 'id')->where('organization_id', $organization->id)],
            'category' => ['nullable', 'string', 'max:60'],
            'gender' => ['nullable', Rule::in(['male', 'female', 'mixed'])],
            'color' => ['nullable', 'regex:/^#[0-9A-Fa-f]{6}$/'],
        ]);
    }
}
