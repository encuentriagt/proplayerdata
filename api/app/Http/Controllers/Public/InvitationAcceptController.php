<?php

namespace App\Http\Controllers\Public;

use App\Http\Controllers\Controller;
use App\Models\GuardianPlayer;
use App\Models\Invitation;
use App\Models\OrganizationMember;
use App\Models\Player;
use App\Models\Team;
use App\Models\TeamStaff;
use App\Models\User;
use App\Services\InvitationService;
use App\Support\ApiError;
use App\Support\Audit;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rules\Password;

/** Ver y aceptar una invitación con el token del enlace (sin sesión). */
class InvitationAcceptController extends Controller
{
    public function show(string $token): JsonResponse
    {
        $inv = InvitationService::findByToken($token);
        if (! $inv || $inv->revoked_at) {
            return ApiError::response('invitation_not_found', 'La invitación no existe o fue anulada.', 404);
        }

        return response()->json(['data' => [
            'status' => $inv->accepted_at ? 'accepted' : ($inv->expires_at->isPast() ? 'expired' : 'pending'),
            'role' => $inv->role,
            'role_label' => InvitationService::ROLE_LABELS[$inv->role] ?? $inv->role,
            'email_masked' => self::mask($inv->email),
            'user_exists' => User::withTrashed()->where('email', $inv->email)->exists(),
            'player_first_name' => $inv->player_id ? Player::find($inv->player_id)?->first_name : null,
            'organization' => $inv->organization->brandingPayload(),
        ]]);
    }

    public function accept(Request $request, string $token): JsonResponse
    {
        $inv = InvitationService::findByToken($token);
        if (! $inv || $inv->revoked_at) {
            return ApiError::response('invitation_not_found', 'La invitación no existe o fue anulada.', 404);
        }

        $existing = User::withTrashed()->where('email', $inv->email)->first();

        if ($existing) {
            $request->validate(['password' => ['required', 'string', 'max:200']]);
            if ($existing->trashed() || ! $existing->isActive() || ! Hash::check((string) $request->input('password'), $existing->password)) {
                return ApiError::response('invalid_credentials', 'La contraseña no es correcta para esta cuenta.', 422);
            }
        } else {
            $request->validate([
                'name' => ['required', 'string', 'min:3', 'max:150'],
                'password' => ['required', 'string', 'max:200', 'confirmed', Password::defaults()],
                'relationship' => ['nullable', 'string', 'max:20'],
            ]);
        }

        $result = DB::transaction(function () use ($inv, $existing, $request) {
            $locked = Invitation::whereKey($inv->id)->lockForUpdate()->first();
            if ($locked->accepted_at || $locked->revoked_at || $locked->expires_at->isPast()) {
                return null;
            }

            $user = $existing;
            if (! $user) {
                $user = new User(['name' => trim($request->string('name')), 'email' => $inv->email, 'password' => (string) $request->input('password')]);
                $user->forceFill(['status' => 'active', 'email_verified_at' => now()])->save();
            }

            if ($inv->role === 'guardian') {
                GuardianPlayer::updateOrCreate(
                    ['user_id' => $user->id, 'player_id' => $inv->player_id],
                    ['relationship' => $request->input('relationship'), 'verified_at' => now()],
                );
            } else {
                OrganizationMember::updateOrCreate(
                    ['organization_id' => $inv->organization_id, 'user_id' => $user->id, 'role' => $inv->role],
                    ['status' => 'active'],
                );
                $teamIds = Team::where('organization_id', $inv->organization_id)->whereIn('id', $inv->team_ids ?? [])->pluck('id');
                if ($inv->role === 'director') {
                    // El alcance del director: deportes completos y/o equipos sueltos.
                    foreach ($inv->sport_ids ?? [] as $sportId) {
                        \App\Models\DirectorScope::firstOrCreate(['organization_id' => $inv->organization_id, 'user_id' => $user->id, 'sport_id' => $sportId, 'team_id' => null]);
                    }
                    foreach ($teamIds as $teamId) {
                        \App\Models\DirectorScope::firstOrCreate(['organization_id' => $inv->organization_id, 'user_id' => $user->id, 'sport_id' => null, 'team_id' => $teamId]);
                    }
                } else {
                    foreach ($teamIds as $teamId) {
                        TeamStaff::firstOrCreate(['team_id' => $teamId, 'user_id' => $user->id], ['role' => 'head_coach']);
                    }
                }
            }

            $locked->update(['accepted_at' => now(), 'accepted_by' => $user->id]);
            Audit::log('invitation.accepted', $locked, ['role' => $inv->role, 'new_user' => ! $existing], $inv->organization_id, $user->id);

            return $user;
        });

        if (! $result) {
            return ApiError::response('invitation_unusable', 'La invitación ya fue usada o venció. Pida una nueva.', 410);
        }

        return response()->json(['data' => ['ok' => true, 'email' => $result->email, 'role' => $inv->role]]);
    }

    private static function mask(string $email): string
    {
        [$u, $d] = explode('@', $email, 2) + [1 => ''];

        return mb_substr($u, 0, 2).str_repeat('*', max(1, mb_strlen($u) - 2)).'@'.$d;
    }
}
