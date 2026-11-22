<?php

namespace App\Http\Controllers\App;

use App\Http\Controllers\Controller;
use App\Models\Device;
use App\Models\GuardianPlayer;
use App\Models\OrganizationMember;
use App\Models\PlanGrant;
use App\Models\Player;
use App\Models\UserNotification;
use App\Services\PlanService;
use App\Support\ApiError;
use App\Support\Audit;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

class AccountController extends Controller
{
    public function __construct(private PlanService $plans) {}

    /** Plan del padre. SIN precios ni menciones de pago (Apple 3.1.3(c)). */
    public function plan(Request $request): JsonResponse
    {
        $user = $request->user();
        $grant = $this->plans->activeGrant($user);
        $level = $grant?->plan ?? 'free';

        return response()->json(['data' => [
            'level' => $level,
            'label' => config("plans.levels.$level.label"),
            'assigned_by' => $grant?->organization?->name,
            'ends_at' => $grant?->ends_at?->toIso8601String(),
            'pro_player_id' => $grant?->plan === 'pro' ? $grant->pro_player_id : null,
            'can_change_pro_child' => $grant?->plan === 'pro' && $this->canChangeProChild($grant),
            'limits' => config("plans.levels.$level"),
        ]]);
    }

    /** Plan Pro: elegir el hijo que tiene todo sin límites. */
    public function chooseProChild(Request $request): JsonResponse
    {
        $user = $request->user();
        $data = $request->validate(['player_id' => ['required', 'integer']]);
        $grant = $this->plans->activeGrant($user);
        if (! $grant || $grant->plan !== 'pro') {
            return ApiError::response('not_pro', 'Esta opción es solo para el plan Pro.', 422);
        }
        if (! GuardianPlayer::where('user_id', $user->id)->where('player_id', $data['player_id'])->exists()) {
            return ApiError::response('forbidden', 'No tiene permiso para realizar esta acción.', 403);
        }
        if ($grant->pro_player_id === (int) $data['player_id']) {
            return response()->json(['data' => ['pro_player_id' => $grant->pro_player_id]]);
        }
        if (! $this->canChangeProChild($grant)) {
            return ApiError::response('pro_child_locked', 'Solo puede cambiar el hijo elegido una vez cada '.config('plans.pro_child_change_days').' días.', 422);
        }

        // La primera elección es libre; los cambios posteriores quedan limitados.
        $grant->update(['pro_player_id' => $data['player_id'], 'pro_player_changed_at' => $grant->pro_player_id ? now() : null]);
        Audit::log('plan.pro_child_chosen', $grant, ['player_id' => $data['player_id']]);

        return response()->json(['data' => ['pro_player_id' => $grant->pro_player_id]]);
    }

    /**
     * Borrar la cuenta (obligatorio en las tiendas). Pide la contraseña.
     * Se borran vínculos, dispositivos, avisos y sesiones; el usuario queda anonimizado.
     * Los datos deportivos de los hijos pertenecen a la organización y se conservan.
     */
    public function destroy(Request $request): JsonResponse
    {
        $user = $request->user();
        $request->validate(['password' => ['required', 'string', 'max:200']]);
        if (! Hash::check((string) $request->input('password'), $user->password)) {
            return ApiError::response('invalid_credentials', 'La contraseña no es correcta.', 422);
        }
        if (OrganizationMember::where('user_id', $user->id)->where('role', 'org_admin')->where('status', 'active')->exists()) {
            return ApiError::response('is_org_admin', 'Usted es administrador de una organización. Comuníquese con soporte para borrar su cuenta.', 409);
        }

        Audit::log('account.deleted', $user, [], null, $user->id);

        DB::transaction(function () use ($user) {
            GuardianPlayer::where('user_id', $user->id)->delete();
            OrganizationMember::where('user_id', $user->id)->delete();
            Device::where('user_id', $user->id)->delete();
            UserNotification::where('user_id', $user->id)->delete();
            PlanGrant::where('user_id', $user->id)->whereNull('revoked_at')->update(['revoked_at' => now()]);
            $user->tokens()->delete();
            $user->forceFill([
                'name' => 'Cuenta eliminada',
                'email' => 'deleted+'.$user->id.'.'.Str::random(8).'@invalid.ppdguate.com',
                'phone' => null,
                'password' => Str::random(64),
                'status' => 'disabled',
                'google_sub' => null, 'apple_sub' => null, 'apple_refresh_token' => null, 'totp_secret' => null,
            ])->save();
            $user->delete();
        });

        return response()->json(['data' => ['ok' => true]]);
    }

    private function canChangeProChild($grant): bool
    {
        return ! $grant->pro_player_id || ! $grant->pro_player_changed_at
            || $grant->pro_player_changed_at->lt(now()->subDays(config('plans.pro_child_change_days')));
    }
}
