<?php

namespace App\Http\Controllers\Pc;

use App\Http\Controllers\Controller;
use App\Models\Organization;
use App\Models\Player;
use App\Models\Team;
use App\Models\TeamPlayer;
use App\Support\Audit;
use App\Support\OrgAccess;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class PlayerController extends Controller
{
    /** Jugadores visibles. ?team_id= ?search= (paginado de 50). */
    public function index(Request $request, Organization $organization, OrgAccess $access): JsonResponse
    {
        $request->validate(['team_id' => ['nullable', 'integer'], 'search' => ['nullable', 'string', 'max:80']]);
        $teamId = $request->integer('team_id');

        $q = Player::where('organization_id', $organization->id);

        if ($teamId) {
            $access->authorize(in_array($teamId, $access->teamIds(), true));
            $q->whereIn('id', TeamPlayer::where('team_id', $teamId)->select('player_id'));
        } elseif (! $access->seesAllTeams()) {
            $q->whereIn('id', TeamPlayer::whereIn('team_id', $access->teamIds())->select('player_id'));
        }

        if ($s = trim((string) $request->input('search'))) {
            $like = '%'.str_replace(['%', '_'], ['\%', '\_'], $s).'%';
            $q->where(fn ($w) => $w->where('first_name', 'like', $like)->orWhere('last_name', 'like', $like));
        }

        $page = $q->orderBy('last_name')->orderBy('first_name')->paginate(50);

        return response()->json([
            'data' => collect($page->items())->map(fn (Player $p) => $p->payload())->values(),
            'meta' => ['current_page' => $page->currentPage(), 'last_page' => $page->lastPage(), 'total' => $page->total()],
        ]);
    }

    public function show(Organization $organization, Player $player, OrgAccess $access): JsonResponse
    {
        $access->authorize($access->canViewPlayer($player));

        $data = $player->payload(true);
        $data['teams'] = $player->teams()->whereIn('teams.id', $access->teamIds())->with('sport')->get()->map(fn (Team $t) => [
            'id' => $t->id, 'name' => $t->name, 'sport' => $t->sport->name,
            'jersey_number' => $t->pivot->jersey_number, 'sport_position_id' => $t->pivot->sport_position_id, 'active' => (bool) $t->pivot->active,
        ]);
        $data['guardians'] = $player->guardians()->get()->map(fn ($u) => [
            'user_id' => $u->id, 'name' => $u->name,
            'email' => $access->isAdmin() ? $u->email : null,
            'relationship' => $u->pivot->relationship,
        ]);

        return response()->json(['data' => $data]);
    }

    /** Admin crea en cualquier equipo; coach/director solo en equipos que trabaja (team_id obligatorio). */
    public function store(Request $request, Organization $organization, OrgAccess $access): JsonResponse
    {
        $data = $request->validate(array_merge($this->rules(), [
            'team_id' => [$access->isAdmin() ? 'nullable' : 'required', 'integer', Rule::exists('teams', 'id')->where('organization_id', $organization->id)->whereNull('deleted_at')],
            'jersey_number' => ['nullable', 'integer', 'min:0', 'max:999'],
            'sport_position_id' => ['nullable', 'integer'],
        ]));

        $team = isset($data['team_id']) ? Team::find($data['team_id']) : null;
        if ($team) {
            $access->authorize($access->canWorkOnTeam($team));
            $this->assertPosition($team, $data['sport_position_id'] ?? null);
        } else {
            $access->authorize($access->isAdmin());
        }

        $player = DB::transaction(function () use ($organization, $data, $team) {
            $player = $organization->players()->create(collect($data)->only(['first_name', 'last_name', 'birthdate', 'gender', 'document_number', 'notes'])->all());
            if ($team) {
                TeamPlayer::create([
                    'team_id' => $team->id, 'player_id' => $player->id,
                    'jersey_number' => $data['jersey_number'] ?? null, 'sport_position_id' => $data['sport_position_id'] ?? null,
                ]);
            }

            return $player;
        });
        Audit::log('player.created', $player, ['team_id' => $team?->id], $organization->id);

        return response()->json(['data' => $player->payload(true)], 201);
    }

    public function update(Request $request, Organization $organization, Player $player, OrgAccess $access): JsonResponse
    {
        $access->authorize($access->canViewPlayer($player));
        $data = $request->validate($this->rules(true));
        $player->update($data);
        Audit::log('player.updated', $player, array_keys($data), $organization->id);

        return response()->json(['data' => $player->fresh()->payload(true)]);
    }

    public function destroy(Organization $organization, Player $player, OrgAccess $access): JsonResponse
    {
        $access->authorize($access->isAdmin());
        $player->delete();
        Audit::log('player.deleted', $player, [], $organization->id);

        return response()->json(['data' => ['ok' => true]]);
    }

    /** Foto del jugador: jpg/png/webp, máx. 3 MB, se guarda privada con nombre aleatorio. */
    public function photo(Request $request, Organization $organization, Player $player, OrgAccess $access): JsonResponse
    {
        $access->authorize($access->canViewPlayer($player));
        $request->validate(['photo' => ['required', 'file', 'mimes:jpg,jpeg,png,webp', 'mimetypes:image/jpeg,image/png,image/webp', 'max:3072', 'dimensions:max_width=6000,max_height=6000']]);

        $file = $request->file('photo');
        $path = $file->storeAs("players/{$organization->id}", Str::uuid().'.'.$file->extension(), 'local');
        $old = $player->photo_path;
        $player->forceFill(['photo_path' => $path])->save();
        if ($old) {
            Storage::disk('local')->delete($old);
        }
        Audit::log('player.photo_updated', $player, [], $organization->id);

        return response()->json(['data' => ['photo_url' => $player->photoUrl()]]);
    }

    private function rules(bool $partial = false): array
    {
        $req = $partial ? 'sometimes' : 'required';

        return [
            'first_name' => [$req, 'string', 'min:1', 'max:80'],
            'last_name' => [$req, 'string', 'min:1', 'max:80'],
            'birthdate' => ['nullable', 'date', 'before:today', 'after:1940-01-01'],
            'gender' => ['nullable', Rule::in(['male', 'female', 'other'])],
            'document_number' => ['nullable', 'string', 'max:40'],
            'notes' => ['nullable', 'string', 'max:2000'],
        ];
    }

    private function assertPosition(Team $team, ?int $positionId): void
    {
        if (! \App\Support\Positions::valid($positionId, $team->organization_id, $team->sport_id)) {
            throw \Illuminate\Validation\ValidationException::withMessages(['sport_position_id' => 'La posición no es de su organización o no corresponde al deporte del equipo.']);
        }
    }
}
