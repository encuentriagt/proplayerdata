<?php

namespace App\Http\Middleware;

use App\Enums\MemberRole;
use App\Models\Organization;
use App\Models\OrganizationMember;
use App\Support\ApiError;
use App\Support\OrgAccess;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Rutas /api/pc/orgs/{organization}/...: exige membresía activa en una organización activa
 * y deja disponible OrgAccess para los controladores.
 */
class ResolveOrganization
{
    public function handle(Request $request, Closure $next, ?string $requiredRole = null): Response
    {
        $org = $request->route('organization');
        $user = $request->user();

        if (! $org instanceof Organization) {
            return ApiError::response('not_found', 'No se encontró la organización.', 404);
        }

        $roles = OrganizationMember::where('organization_id', $org->id)
            ->where('user_id', $user->id)
            ->where('status', 'active')
            ->pluck('role')
            ->all();

        if (! $roles) {
            // No revela si la organización existe.
            return ApiError::response('not_found', 'No se encontró la organización.', 404);
        }

        if (! $org->isActive()) {
            return ApiError::response('organization_suspended', 'Su organización no está activa. Comuníquese con su institución.', 403);
        }

        $access = new OrgAccess($org, $user, array_map(fn ($r) => $r instanceof MemberRole ? $r : MemberRole::from($r), $roles));

        if ($requiredRole === 'admin' && ! $access->isAdmin()) {
            return ApiError::response('forbidden', 'No tiene permiso para realizar esta acción.', 403);
        }

        app()->instance(OrgAccess::class, $access);

        return $next($request);
    }
}
