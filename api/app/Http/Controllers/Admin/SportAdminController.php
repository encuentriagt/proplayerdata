<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Sport;
use App\Models\SportPosition;
use App\Models\SportStatType;
use App\Support\Audit;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/** Super admin: catálogo de deportes. No se borra nada (hay historial): se desactiva el deporte. */
class SportAdminController extends Controller
{
    public function index(): JsonResponse
    {
        return response()->json(['data' => Sport::with(['positions', 'statTypes'])->orderBy('sort')->get()
            ->map(fn (Sport $s) => array_merge($s->payload(), ['active' => $s->active]))]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate(array_merge($this->sportRules(), ['code' => ['required', 'regex:/^[a-z0-9_]{2,30}$/', Rule::unique('sports', 'code')]]));
        $sport = Sport::create($data);
        Audit::log('sport.created', $sport, ['code' => $sport->code]);

        return response()->json(['data' => $sport->load(['positions', 'statTypes'])->payload()], 201);
    }

    public function update(Request $request, Sport $sport): JsonResponse
    {
        $sport->update($request->validate($this->sportRules(true)));
        Audit::log('sport.updated', $sport);

        return response()->json(['data' => array_merge($sport->load(['positions', 'statTypes'])->payload(), ['active' => $sport->active])]);
    }

    public function storePosition(Request $request, Sport $sport): JsonResponse
    {
        $data = $request->validate([
            'code' => ['required', 'regex:/^[A-Z0-9]{1,12}$/', Rule::unique('sport_positions', 'code')->where('sport_id', $sport->id)->whereNull('organization_id')],
            'name' => ['required', 'string', 'max:60'], 'sort' => ['sometimes', 'integer', 'min:0', 'max:999'],
        ]);
        $p = $sport->positions()->create($data);
        Audit::log('sport.position_created', $p, ['sport_id' => $sport->id]);

        return response()->json(['data' => ['id' => $p->id, 'code' => $p->code, 'name' => $p->name]], 201);
    }

    public function updatePosition(Request $request, SportPosition $position): JsonResponse
    {
        abort_if($position->organization_id !== null, 404); // aquí solo el catálogo
        $position->update($request->validate(['name' => ['sometimes', 'string', 'max:60'], 'sort' => ['sometimes', 'integer', 'min:0', 'max:999']]));

        return response()->json(['data' => ['id' => $position->id, 'code' => $position->code, 'name' => $position->name]]);
    }

    public function storeStatType(Request $request, Sport $sport): JsonResponse
    {
        $data = $request->validate([
            'code' => ['required', 'regex:/^[a-z0-9_]{2,30}$/', Rule::unique('sport_stat_types', 'code')->where('sport_id', $sport->id)],
            'name' => ['required', 'string', 'max:60'],
            'scores' => ['sometimes', 'integer', 'min:0', 'max:20'], 'sort' => ['sometimes', 'integer', 'min:0', 'max:999'],
        ]);
        $t = $sport->statTypes()->create($data + ['is_player_stat' => true]);
        Audit::log('sport.stat_type_created', $t, ['sport_id' => $sport->id]);

        return response()->json(['data' => ['id' => $t->id, 'code' => $t->code, 'name' => $t->name, 'scores' => $t->scores]], 201);
    }

    public function updateStatType(Request $request, SportStatType $statType): JsonResponse
    {
        // El código y lo que suma al marcador no cambian (afectaría fichas ya guardadas).
        $statType->update($request->validate(['name' => ['sometimes', 'string', 'max:60'], 'sort' => ['sometimes', 'integer', 'min:0', 'max:999']]));

        return response()->json(['data' => ['id' => $statType->id, 'code' => $statType->code, 'name' => $statType->name, 'scores' => $statType->scores]]);
    }

    private function sportRules(bool $partial = false): array
    {
        $req = $partial ? 'sometimes' : 'required';

        return [
            'name' => [$req, 'string', 'max:60'],
            'periods' => [$req, 'integer', 'min:1', 'max:20'],
            'period_minutes' => ['sometimes', 'integer', 'min:0', 'max:120'],
            'max_on_field' => ['nullable', 'integer', 'min:1', 'max:50'],
            'unlimited_substitutions' => ['sometimes', 'boolean'],
            'active' => ['sometimes', 'boolean'],
            'sort' => ['sometimes', 'integer', 'min:0', 'max:999'],
        ];
    }
}
