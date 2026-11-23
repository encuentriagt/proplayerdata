<?php

namespace App\Http\Controllers\Pc;

use App\Http\Controllers\Controller;
use App\Models\Organization;
use App\Models\OrganizationMember;
use App\Models\Team;
use App\Models\TeamStaff;
use App\Support\Audit;
use App\Support\OrgAccess;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/** Asignar coaches a equipos (solo admin de la organización). */
class TeamStaffController extends Controller
{
    public function store(Request $request, Organization $organization, Team $team, OrgAccess $access): JsonResponse
    {
        $access->authorize($access->canManageTeam($team));
        $data = $request->validate([
            'user_id' => ['required', 'integer'],
            'role' => ['sometimes', Rule::in(['head_coach', 'assistant'])],
        ]);

        // El admin asigna a cualquier miembro; el director solo a coaches que él administra.
        $members = OrganizationMember::where('organization_id', $organization->id)
            ->where('user_id', $data['user_id'])->where('status', 'active')->get();
        $allowed = $access->isAdmin()
            ? $members->isNotEmpty()
            : $members->contains(fn ($m) => $m->role === \App\Enums\MemberRole::Coach && $access->canManageMember($m));
        if (! $allowed) {
            return response()->json(['error' => ['code' => 'not_a_member', 'message' => 'Ese usuario no es un coach que usted pueda asignar.']], 422);
        }

        $staff = TeamStaff::updateOrCreate(
            ['team_id' => $team->id, 'user_id' => $data['user_id']],
            ['role' => $data['role'] ?? 'head_coach'],
        );
        Audit::log('team.staff_assigned', $team, ['user_id' => $data['user_id'], 'role' => $staff->role], $organization->id);

        return response()->json(['data' => ['team_id' => $team->id, 'user_id' => $staff->user_id, 'role' => $staff->role]], 201);
    }

    public function destroy(Organization $organization, Team $team, int $userId, OrgAccess $access): JsonResponse
    {
        $access->authorize($access->canManageTeam($team));
        TeamStaff::where('team_id', $team->id)->where('user_id', $userId)->delete();
        Audit::log('team.staff_removed', $team, ['user_id' => $userId], $organization->id);

        return response()->json(['data' => ['ok' => true]]);
    }
}
