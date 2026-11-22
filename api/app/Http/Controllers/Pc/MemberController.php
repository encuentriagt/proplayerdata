<?php

namespace App\Http\Controllers\Pc;

use App\Http\Controllers\Controller;
use App\Models\Organization;
use App\Models\OrganizationMember;
use App\Models\TeamStaff;
use App\Support\Audit;
use App\Support\OrgAccess;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/** Miembros de la organización (admin): ver, desactivar/activar, quitar rol. */
class MemberController extends Controller
{
    public function index(Organization $organization, OrgAccess $access): JsonResponse
    {
        $access->authorize($access->isAdmin());

        $members = OrganizationMember::with('user:id,name,email,last_login_at')
            ->where('organization_id', $organization->id)->orderBy('role')->get();
        $teams = TeamStaff::whereIn('user_id', $members->pluck('user_id'))
            ->whereHas('team', fn ($q) => $q->where('organization_id', $organization->id))
            ->with('team:id,name')->get()->groupBy('user_id');

        return response()->json(['data' => $members->map(fn (OrganizationMember $m) => [
            'id' => $m->id,
            'user_id' => $m->user_id,
            'name' => $m->user?->name,
            'email' => $m->user?->email,
            'role' => $m->role->value,
            'role_label' => $m->role->label(),
            'status' => $m->status,
            'last_login_at' => $m->user?->last_login_at?->toIso8601String(),
            'teams' => ($teams[$m->user_id] ?? collect())->map(fn ($s) => ['id' => $s->team_id, 'name' => $s->team?->name, 'role' => $s->role])->values(),
        ])]);
    }

    public function update(Request $request, Organization $organization, OrganizationMember $member, OrgAccess $access): JsonResponse
    {
        $access->authorize($access->isAdmin());
        $data = $request->validate(['status' => ['required', Rule::in(['active', 'disabled'])]]);

        if ($member->user_id === $access->user->id) {
            return response()->json(['error' => ['code' => 'cannot_change_self', 'message' => 'No puede desactivarse a sí mismo.']], 422);
        }

        $member->update($data);
        Audit::log('member.status_changed', $member, ['status' => $data['status'], 'user_id' => $member->user_id], $organization->id);

        return response()->json(['data' => ['id' => $member->id, 'status' => $member->status]]);
    }

    public function destroy(Organization $organization, OrganizationMember $member, OrgAccess $access): JsonResponse
    {
        $access->authorize($access->isAdmin());
        if ($member->user_id === $access->user->id) {
            return response()->json(['error' => ['code' => 'cannot_change_self', 'message' => 'No puede quitarse su propio rol.']], 422);
        }

        TeamStaff::where('user_id', $member->user_id)
            ->whereIn('team_id', $organization->teams()->select('id'))->delete();
        $member->delete();
        Audit::log('member.removed', $member, ['user_id' => $member->user_id, 'role' => $member->role->value], $organization->id);

        return response()->json(['data' => ['ok' => true]]);
    }
}
