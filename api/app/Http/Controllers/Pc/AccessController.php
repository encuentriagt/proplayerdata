<?php

namespace App\Http\Controllers\Pc;

use App\Http\Controllers\Controller;
use App\Models\Organization;
use App\Support\OrgAccess;
use Illuminate\Http\JsonResponse;

/** GET /api/pc/orgs/{slug}/access — roles y permisos del usuario en esta organización (para mostrar u ocultar opciones). */
class AccessController extends Controller
{
    public function __invoke(Organization $organization, OrgAccess $access): JsonResponse
    {
        return response()->json(['data' => [
            'roles' => array_map(fn ($r) => $r->value, $access->roles),
            'permissions' => $access->permissions(),
            'team_ids' => $access->teamIds(),
        ]]);
    }
}
