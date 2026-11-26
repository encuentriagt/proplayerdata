<?php

namespace App\Http\Controllers\Pc;

use App\Http\Controllers\Controller;
use App\Models\Organization;
use App\Support\Audit;
use App\Support\OrgAccess;
use App\Support\StaffAlerts;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Avisos opcionales del admin de la organización (por ahora: partido publicado). */
class NotificationPrefsController extends Controller
{
    public function show(Organization $organization, OrgAccess $access): JsonResponse
    {
        $access->authorize($access->isAdmin());

        return response()->json(['data' => ['match_published' => StaffAlerts::isSubscribed($access->user, $organization->id)]]);
    }

    public function update(Request $request, Organization $organization, OrgAccess $access): JsonResponse
    {
        $access->authorize($access->isAdmin());
        $data = $request->validate(['match_published' => ['required', 'boolean']]);
        StaffAlerts::set($access->user, $data['match_published'] ? [$organization->id] : [], StaffAlerts::MATCH_PUBLISHED, [$organization->id]);
        Audit::log('notification_prefs.updated', $organization, $data, $organization->id);

        return response()->json(['data' => ['match_published' => (bool) $data['match_published']]]);
    }
}
