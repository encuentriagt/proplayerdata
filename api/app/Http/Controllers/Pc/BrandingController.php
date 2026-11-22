<?php

namespace App\Http\Controllers\Pc;

use App\Http\Controllers\Controller;
use App\Models\Organization;
use App\Services\BrandingService;
use App\Support\ApiError;
use App\Support\Audit;
use App\Support\OrgAccess;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** El admin de la organización edita su marca, solo si el super admin lo permitió. */
class BrandingController extends Controller
{
    public function update(Request $request, Organization $organization, OrgAccess $access): JsonResponse
    {
        $access->authorize($access->isAdmin());
        if (! $organization->branding_editable_by_org) {
            return ApiError::response('branding_locked', 'La marca de su organización la administra ppd.', 403);
        }
        $color = ['sometimes', 'regex:'.Organization::COLOR_REGEX];
        $data = $request->validate(['color_primary' => $color, 'color_secondary' => $color, 'color_on_primary' => $color]);
        $organization->update($data);
        Audit::log('organization.branding_updated', $organization, ['fields' => array_keys($data)], $organization->id);

        return response()->json(['data' => $organization->brandingPayload()]);
    }

    public function image(Request $request, Organization $organization, string $kind, OrgAccess $access, BrandingService $branding): JsonResponse
    {
        $access->authorize($access->isAdmin());
        if (! $organization->branding_editable_by_org) {
            return ApiError::response('branding_locked', 'La marca de su organización la administra ppd.', 403);
        }
        abort_unless(isset(BrandingService::KINDS[$kind]), 404);
        $request->validate(['image' => BrandingService::RULES]);
        $url = $branding->store($organization, $kind, $request->file('image'));
        Audit::log('organization.branding_updated', $organization, ['kind' => $kind], $organization->id);

        return response()->json(['data' => ['kind' => $kind, 'url' => $url]]);
    }
}
