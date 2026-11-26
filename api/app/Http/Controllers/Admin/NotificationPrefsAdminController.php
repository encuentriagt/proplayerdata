<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Support\Audit;
use App\Support\StaffAlerts;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/** Avisos opcionales del super admin: partidos publicados de todas las organizaciones o de algunas. */
class NotificationPrefsAdminController extends Controller
{
    public function show(Request $request): JsonResponse
    {
        return response()->json(['data' => $this->state($request->user()->id)]);
    }

    public function update(Request $request): JsonResponse
    {
        $data = $request->validate([
            'match_published' => ['required', 'boolean'],
            // null o ausente = todas las organizaciones; lista = solo esas.
            'organization_ids' => ['nullable', 'array', 'max:500'],
            'organization_ids.*' => ['integer', 'distinct', 'exists:organizations,id'],
        ]);
        $user = $request->user();
        $targets = ! $data['match_published'] ? [] : (empty($data['organization_ids']) ? [null] : array_map('intval', $data['organization_ids']));
        StaffAlerts::set($user, $targets);
        Audit::log('notification_prefs.updated', $user, ['match_published' => $data['match_published'], 'organizations' => $data['organization_ids'] ?? 'all']);

        return response()->json(['data' => $this->state($user->id)]);
    }

    private function state(int $userId): array
    {
        $rows = DB::table('notification_subscriptions')->where('user_id', $userId)->where('kind', StaffAlerts::MATCH_PUBLISHED)->pluck('organization_id');

        return [
            'match_published' => $rows->isNotEmpty(),
            'organization_ids' => $rows->contains(null) || $rows->isEmpty() ? null : $rows->map(fn ($i) => (int) $i)->values()->all(),
        ];
    }
}
