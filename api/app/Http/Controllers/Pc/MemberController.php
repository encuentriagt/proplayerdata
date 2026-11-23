<?php

namespace App\Http\Controllers\Pc;

use App\Enums\MemberRole;
use App\Http\Controllers\Controller;
use App\Models\DirectorScope;
use App\Models\Organization;
use App\Models\OrganizationMember;
use App\Models\Sport;
use App\Models\Team;
use App\Models\TeamStaff;
use App\Services\PasswordResetService;
use App\Support\Audit;
use App\Support\OrgAccess;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/**
 * Miembros de la organización.
 * - Admin: todos (incluidos directores técnicos y su alcance).
 * - Director técnico: solo los coaches que administra (equipos dentro de su alcance). Nunca otros directores ni admins.
 * - Coach: sin acceso.
 */
class MemberController extends Controller
{
    public function index(Organization $organization, OrgAccess $access): JsonResponse
    {
        $access->authorize($access->isAdmin() || $access->isDirector());

        $members = OrganizationMember::with('user:id,name,email,last_login_at')
            ->where('organization_id', $organization->id)->orderBy('role')->get()
            ->filter(fn (OrganizationMember $m) => $access->isAdmin() || $access->canManageMember($m))
            ->values();

        $visibleTeams = $access->teamIds();
        $teams = TeamStaff::whereIn('user_id', $members->pluck('user_id'))
            ->whereIn('team_id', $visibleTeams ?: [0])
            ->with('team:id,name')->get()->groupBy('user_id');
        $scopes = DirectorScope::where('organization_id', $organization->id)
            ->whereIn('user_id', $members->where('role', MemberRole::Director)->pluck('user_id'))->get()->groupBy('user_id');

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
            'director_scope' => $m->role === MemberRole::Director ? $this->scopePayload($scopes[$m->user_id] ?? collect()) : null,
        ])]);
    }

    public function update(Request $request, Organization $organization, OrganizationMember $member, OrgAccess $access): JsonResponse
    {
        $access->authorize($access->canManageMember($member));
        $data = $request->validate(['status' => ['required', Rule::in(['active', 'disabled'])]]);

        if ($member->user_id === $access->user->id) {
            return response()->json(['error' => ['code' => 'cannot_change_self', 'message' => 'No puede desactivarse a sí mismo.']], 422);
        }

        $member->update($data);
        Audit::log('member.status_changed', $member, ['status' => $data['status'], 'user_id' => $member->user_id], $organization->id);

        return response()->json(['data' => ['id' => $member->id, 'status' => $member->status]]);
    }

    /** Alcance de un director técnico (solo admin): deportes completos y/o equipos sueltos. Reemplaza el anterior. */
    public function scopes(Request $request, Organization $organization, OrganizationMember $member, OrgAccess $access): JsonResponse
    {
        $access->authorize($access->isAdmin());
        if ($member->role !== MemberRole::Director) {
            return response()->json(['error' => ['code' => 'not_a_director', 'message' => 'Ese miembro no es director técnico.']], 422);
        }
        $data = $request->validate([
            'sport_ids' => ['present', 'array', 'max:30'], 'sport_ids.*' => ['integer', Rule::exists('sports', 'id')],
            'team_ids' => ['present', 'array', 'max:100'], 'team_ids.*' => ['integer', Rule::exists('teams', 'id')->where('organization_id', $organization->id)],
        ]);

        DB::transaction(function () use ($organization, $member, $data) {
            DirectorScope::where('organization_id', $organization->id)->where('user_id', $member->user_id)->delete();
            foreach (array_unique($data['sport_ids']) as $sid) {
                DirectorScope::create(['organization_id' => $organization->id, 'user_id' => $member->user_id, 'sport_id' => $sid]);
            }
            foreach (array_unique($data['team_ids']) as $tid) {
                DirectorScope::create(['organization_id' => $organization->id, 'user_id' => $member->user_id, 'team_id' => $tid]);
            }
        });
        Audit::log('member.director_scope_changed', $member, ['sport_ids' => $data['sport_ids'], 'team_ids' => $data['team_ids']], $organization->id);

        $rows = DirectorScope::where('organization_id', $organization->id)->where('user_id', $member->user_id)->get();

        return response()->json(['data' => ['id' => $member->id, 'director_scope' => $this->scopePayload($rows)]]);
    }

    /** Genera un enlace para que el miembro cree una nueva contraseña (24 h). Para compartir por WhatsApp. */
    public function resetPassword(Organization $organization, OrganizationMember $member, OrgAccess $access, PasswordResetService $resets): JsonResponse
    {
        $access->authorize($access->canManageMember($member));
        if ($member->user_id === $access->user->id) {
            return response()->json(['error' => ['code' => 'cannot_change_self', 'message' => 'Use "Cambiar contraseña" en su perfil.']], 422);
        }
        $user = $member->user;
        if (! $user || ! $user->isActive()) {
            return response()->json(['error' => ['code' => 'user_inactive', 'message' => 'El usuario no está activo.']], 422);
        }
        $token = $resets->create($user, 'org_admin', $access->user, now()->addHours(PasswordResetService::ADMIN_HOURS));
        Audit::log('member.password_reset_link', $member, ['user_id' => $user->id], $organization->id);

        return response()->json(['data' => [
            'reset_url' => $resets->url($user, $token, $organization),
            'expires_at' => now()->addHours(PasswordResetService::ADMIN_HOURS)->toIso8601String(),
        ]]);
    }

    public function destroy(Organization $organization, OrganizationMember $member, OrgAccess $access): JsonResponse
    {
        $access->authorize($access->canManageMember($member));
        if ($member->user_id === $access->user->id) {
            return response()->json(['error' => ['code' => 'cannot_change_self', 'message' => 'No puede quitarse su propio rol.']], 422);
        }

        DB::transaction(function () use ($organization, $member) {
            if ($member->role === MemberRole::Coach) {
                TeamStaff::where('user_id', $member->user_id)->whereIn('team_id', $organization->teams()->select('id'))->delete();
            }
            if ($member->role === MemberRole::Director) {
                DirectorScope::where('organization_id', $organization->id)->where('user_id', $member->user_id)->delete();
            }
            $member->delete();
        });
        Audit::log('member.removed', $member, ['user_id' => $member->user_id, 'role' => $member->role->value], $organization->id);

        return response()->json(['data' => ['ok' => true]]);
    }

    private function scopePayload($rows): array
    {
        $sportIds = $rows->whereNotNull('sport_id')->pluck('sport_id')->unique()->values();
        $teamIds = $rows->whereNotNull('team_id')->pluck('team_id')->unique()->values();

        return [
            'sports' => Sport::whereIn('id', $sportIds)->get(['id', 'code', 'name'])->map(fn ($s) => ['id' => $s->id, 'code' => $s->code, 'name' => $s->name])->values(),
            'teams' => Team::whereIn('id', $teamIds)->get(['id', 'name'])->map(fn ($t) => ['id' => $t->id, 'name' => $t->name])->values(),
        ];
    }
}
