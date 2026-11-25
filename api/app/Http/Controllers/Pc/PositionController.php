<?php

namespace App\Http\Controllers\Pc;

use App\Http\Controllers\Controller;
use App\Models\Organization;
use App\Models\SportPosition;
use App\Models\TeamPlayer;
use App\Support\ApiError;
use App\Support\Audit;
use App\Support\OrgAccess;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

/**
 * Lista de posiciones de la organización por deporte (compartida por todos sus coaches de ese deporte).
 * Nace como copia del catálogo de ppd al activar el deporte; editarla no afecta a otras organizaciones.
 */
class PositionController extends Controller
{
    public function store(Request $request, Organization $organization, int $sportId, OrgAccess $access): JsonResponse
    {
        $access->authorize($access->canManagePositions($sportId));
        $data = $request->validate([
            'name' => ['required', 'string', 'max:60'],
            'code' => ['nullable', 'regex:/^[A-Za-z0-9]{1,12}$/'],
            'sort' => ['sometimes', 'integer', 'min:0', 'max:999'],
        ]);
        $name = trim($data['name']);
        $existing = SportPosition::where('organization_id', $organization->id)->where('sport_id', $sportId);
        if ((clone $existing)->whereRaw('LOWER(name) = ?', [mb_strtolower($name)])->exists()) {
            return ApiError::response('validation_failed', 'Ya existe una posición con ese nombre.', 422, ['fields' => ['name' => ['Ya existe.']]]);
        }
        $code = $this->uniqueCode($organization->id, $sportId, strtoupper($data['code'] ?? $this->codeFrom($name)), isset($data['code']));
        if ($code === null) {
            return ApiError::response('validation_failed', 'Ese código ya se usa en este deporte.', 422, ['fields' => ['code' => ['Ya se usa.']]]);
        }
        $position = SportPosition::create([
            'organization_id' => $organization->id, 'sport_id' => $sportId, 'code' => $code, 'name' => $name,
            'sort' => $data['sort'] ?? ((int) (clone $existing)->max('sort') + 1),
        ]);
        Audit::log('position.created', $position, ['sport_id' => $sportId, 'name' => $name], $organization->id);

        return response()->json(['data' => $position->payload()], 201);
    }

    public function update(Request $request, Organization $organization, int $positionId, OrgAccess $access): JsonResponse
    {
        $position = $this->find($organization, $positionId, $access);
        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:60'],
            'sort' => ['sometimes', 'integer', 'min:0', 'max:999'],
        ]);
        if (isset($data['name'])) {
            $data['name'] = trim($data['name']);
            $dup = SportPosition::where('organization_id', $organization->id)->where('sport_id', $position->sport_id)
                ->whereKeyNot($position->id)->whereRaw('LOWER(name) = ?', [mb_strtolower($data['name'])])->exists();
            if ($dup) {
                return ApiError::response('validation_failed', 'Ya existe una posición con ese nombre.', 422, ['fields' => ['name' => ['Ya existe.']]]);
            }
        }
        $position->update($data);
        Audit::log('position.updated', $position, ['fields' => array_keys($data)], $organization->id);

        return response()->json(['data' => $position->payload()]);
    }

    /** No se borra si algún jugador la tiene en una plantilla activa; las fichas pasadas conservan el nombre. */
    public function destroy(Organization $organization, int $positionId, OrgAccess $access): JsonResponse
    {
        $position = $this->find($organization, $positionId, $access);
        $inUse = TeamPlayer::where('sport_position_id', $position->id)->where('active', true)->count();
        if ($inUse) {
            return ApiError::response('position_in_use', "La usan {$inUse} jugador(es) en sus plantillas. Cámbieles la posición primero.", 422, ['players' => $inUse]);
        }
        $position->delete();
        Audit::log('position.deleted', $position, ['name' => $position->name], $organization->id);

        return response()->json(['data' => ['ok' => true]]);
    }

    private function find(Organization $organization, int $id, OrgAccess $access): SportPosition
    {
        $position = SportPosition::where('organization_id', $organization->id)->findOrFail($id);
        $access->authorize($access->canManagePositions($position->sport_id));

        return $position;
    }

    private function codeFrom(string $name): string
    {
        $code = strtoupper(substr(preg_replace('/[^A-Za-z0-9]/', '', Str::ascii($name)), 0, 3));

        return $code !== '' ? $code : 'POS';
    }

    /** Código libre en la organización y deporte (incluye borradas). Si lo pidió el usuario y está tomado, null. */
    private function uniqueCode(int $orgId, int $sportId, string $base, bool $exact): ?string
    {
        $taken = SportPosition::withTrashed()->where('organization_id', $orgId)->where('sport_id', $sportId)->pluck('code')->all();
        if (! in_array($base, $taken, true)) {
            return $base;
        }
        if ($exact) {
            return null;
        }
        for ($i = 2; $i < 1000; $i++) {
            $c = substr($base, 0, 12 - strlen((string) $i)).$i;
            if (! in_array($c, $taken, true)) {
                return $c;
            }
        }

        return null;
    }
}
