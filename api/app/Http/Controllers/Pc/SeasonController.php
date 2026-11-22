<?php

namespace App\Http\Controllers\Pc;

use App\Http\Controllers\Controller;
use App\Models\Organization;
use App\Models\Season;
use App\Support\Audit;
use App\Support\OrgAccess;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class SeasonController extends Controller
{
    public function index(Organization $organization): JsonResponse
    {
        return response()->json(['data' => $organization->seasons()->orderByDesc('starts_on')->get()->map->payload()]);
    }

    public function store(Request $request, Organization $organization, OrgAccess $access): JsonResponse
    {
        $access->authorize($access->isAdmin());
        $data = $this->validated($request);

        $season = DB::transaction(function () use ($organization, $data) {
            if (! empty($data['is_current'])) {
                $organization->seasons()->update(['is_current' => false]);
            }

            return $organization->seasons()->create($data);
        });
        Audit::log('season.created', $season, ['name' => $season->name], $organization->id);

        return response()->json(['data' => $season->payload()], 201);
    }

    public function update(Request $request, Organization $organization, Season $season, OrgAccess $access): JsonResponse
    {
        $access->authorize($access->isAdmin());
        $data = $this->validated($request, true);

        DB::transaction(function () use ($organization, $season, $data) {
            if (! empty($data['is_current'])) {
                $organization->seasons()->whereKeyNot($season->id)->update(['is_current' => false]);
            }
            $season->update($data);
        });
        Audit::log('season.updated', $season, [], $organization->id);

        return response()->json(['data' => $season->fresh()->payload()]);
    }

    private function validated(Request $request, bool $partial = false): array
    {
        $req = $partial ? 'sometimes' : 'required';

        return $request->validate([
            'name' => [$req, 'string', 'min:2', 'max:60'],
            'starts_on' => ['nullable', 'date'],
            'ends_on' => ['nullable', 'date', 'after_or_equal:starts_on'],
            'is_current' => ['sometimes', 'boolean'],
        ]);
    }
}
