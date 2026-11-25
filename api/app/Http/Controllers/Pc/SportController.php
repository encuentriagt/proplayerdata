<?php

namespace App\Http\Controllers\Pc;

use App\Http\Controllers\Controller;
use App\Models\DirectorScope;
use App\Models\Organization;
use App\Models\Sport;
use App\Models\Team;
use App\Support\ApiError;
use App\Support\Audit;
use App\Support\OrgAccess;
use App\Support\Positions;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/**
 * Deportes activados por la organización. El catálogo (deportes, posiciones y estadísticas) es del super admin;
 * el admin del colegio solo elige cuáles usa.
 */
class SportController extends Controller
{
    /** GET: deportes activados visibles para el miembro (admin todos; director y coach, los de su alcance). */
    public function index(Organization $organization, OrgAccess $access): JsonResponse
    {
        return response()->json(['data' => $this->payload($access->visibleSportIds(), $organization->id)]);
    }

    /** PUT {sport_ids:[...]}: solo admin. Reemplaza la lista (idempotente por naturaleza). */
    public function update(Request $request, Organization $organization, OrgAccess $access): JsonResponse
    {
        $access->authorize($access->isAdmin());
        $data = $request->validate([
            'sport_ids' => ['present', 'array', 'max:50'],
            'sport_ids.*' => ['integer', 'distinct', Rule::exists('sports', 'id')->where('active', true)],
        ]);
        $new = array_values(array_unique(array_map('intval', $data['sport_ids'])));
        $current = $access->enabledSportIds();
        $removed = array_values(array_diff($current, $new));
        $added = array_values(array_diff($new, $current));

        if ($removed) {
            $inUse = Team::where('organization_id', $organization->id)->whereIn('sport_id', $removed)->distinct()->pluck('sport_id');
            if ($inUse->isNotEmpty()) {
                $names = Sport::whereIn('id', $inUse)->orderBy('sort')->pluck('name')->implode(', ');

                return ApiError::response('sport_in_use', "No se puede desactivar un deporte que tiene equipos: {$names}.", 422, [
                    'sport_ids' => $inUse->map(fn ($i) => (int) $i)->values()->all(),
                ]);
            }
        }

        if ($added || $removed) {
            DB::transaction(function () use ($organization, $added, $removed) {
                if ($removed) {
                    DB::table('organization_sports')->where('organization_id', $organization->id)->whereIn('sport_id', $removed)->delete();
                    // Un director no puede quedar con un deporte desactivado en su alcance.
                    DirectorScope::where('organization_id', $organization->id)->whereIn('sport_id', $removed)->delete();
                }
                Positions::enableSports($organization, $added);
            });
            Audit::log('organization.sports_changed', $organization, ['added' => $added, 'removed' => $removed], $organization->id);
        }

        return response()->json(['data' => $this->payload($new, $organization->id)]);
    }

    private function payload(array $ids, int $orgId): array
    {
        $positions = Positions::forOrg($orgId, $ids);

        return Sport::with('statTypes')->whereIn('id', $ids ?: [0])->orderBy('sort')->orderBy('name')->get()
            ->map(fn (Sport $s) => $s->setRelation('positions', $positions->get($s->id, collect()))->payload())->values()->all();
    }
}
