<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\ChangePasswordRequest;
use App\Http\Requests\Auth\LoginRequest;
use App\Models\OrganizationMember;
use App\Models\User;
use App\Support\ApiError;
use App\Support\Audit;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

/**
 * Login con correo y contraseña (docs/ARQUITECTURA.md, secciones 7 y 12).
 * - Una sesión por plataforma (X-App-Platform: web | android | ios).
 * - Bloqueo temporal tras intentos fallidos; mensajes que no revelan si el correo existe.
 * - Contraseña temporal: solo permite /me, /logout y /password hasta cambiarla.
 */
class AuthController extends Controller
{
    private const MAX_FAILED = 5;

    private const LOCK_MINUTES = 15;

    /** Hash bcrypt de un valor aleatorio descartado: solo para igualar tiempos cuando el correo no existe. */
    private const DUMMY_HASH = '$2y$12$OmFeTl0t5DKIQQqIMkP/IuiS/wOazrVkqpSAbQGWotgx0A5rAC2La';

    public function login(LoginRequest $request): JsonResponse
    {
        $platform = $this->platform($request);
        if (! $platform) {
            return ApiError::response('platform_invalid', 'Falta o no es válido el encabezado X-App-Platform.', 422);
        }

        $email = Str::lower(trim($request->string('email')));
        $user = User::where('email', $email)->first();

        // Mismo tiempo de respuesta exista o no el correo.
        $hash = $user?->password ?? self::DUMMY_HASH;
        $passwordOk = Hash::check((string) $request->input('password'), $hash);

        if ($user && $user->locked_until && $user->locked_until->isFuture()) {
            return ApiError::response(
                'account_locked',
                'Por seguridad, su cuenta está bloqueada temporalmente. Intente de nuevo en unos minutos.',
                423,
                ['retry_after_minutes' => (int) ceil(now()->diffInMinutes($user->locked_until, true))]
            );
        }

        if (! $user || ! $passwordOk || ! $user->isActive()) {
            if ($user) {
                $this->registerFailure($user);
            }

            return ApiError::response('invalid_credentials', 'Correo o contraseña incorrectos.', 422);
        }

        $memberships = $this->activeMemberships($user);
        if (! $user->is_super_admin && $memberships->isEmpty() && ! $this->hasActiveChildren($user)) {
            Audit::log('auth.login_denied', $user, ['reason' => 'no_active_organization'], null, $user->id);

            return ApiError::response(
                'no_active_organization',
                'Su usuario no tiene una organización activa. Comuníquese con su institución.',
                403
            );
        }

        $token = DB::transaction(function () use ($user, $platform) {
            // Una sesión por plataforma: se cierran las anteriores de la misma plataforma.
            $user->tokens()->where('name', 'platform:'.$platform)->delete();

            $user->forceFill(['failed_logins' => 0, 'locked_until' => null, 'last_login_at' => now()])->save();

            $minutes = (int) config('sanctum.expiration');

            return $user->createToken('platform:'.$platform, ['basic'], $minutes > 0 ? now()->addMinutes($minutes) : null);
        });

        Audit::log('auth.login', $user, ['platform' => $platform], null, $user->id);

        // Super admin: el panel exige además el código TOTP en esta sesión.
        $totp = $user->is_super_admin ? ($user->totp_confirmed_at ? 'verify' : 'setup') : null;

        return response()->json([
            'data' => [
                'token' => $token->plainTextToken,
                'token_type' => 'Bearer',
                'expires_at' => $token->accessToken->expires_at?->toIso8601String(),
                'user' => $this->userPayload($user),
                'memberships' => $this->membershipsPayload($memberships),
                'is_guardian' => $this->hasActiveChildren($user),
                'admin_totp' => $totp,
            ],
        ]);
    }

    public function me(Request $request): JsonResponse
    {
        $user = $request->user();

        return response()->json(['data' => [
            'user' => $this->userPayload($user),
            'memberships' => $this->membershipsPayload($this->activeMemberships($user)),
            'is_guardian' => $this->hasActiveChildren($user),
        ]]);
    }

    public function logout(Request $request): JsonResponse
    {
        $user = $request->user();
        $user->currentAccessToken()?->delete();
        Audit::log('auth.logout', $user);

        return response()->json(['data' => ['ok' => true]]);
    }

    public function changePassword(ChangePasswordRequest $request): JsonResponse
    {
        $user = $request->user();
        $current = $user->currentAccessToken();

        DB::transaction(function () use ($user, $request, $current) {
            $user->forceFill([
                'password' => $request->string('password'),
                'must_change_password' => false,
            ])->save();

            // Se cierran todas las demás sesiones (otras plataformas o dispositivos).
            $user->tokens()->whereKeyNot($current?->getKey())->delete();
        });

        Audit::log('auth.password_changed', $user);

        return response()->json(['data' => ['ok' => true, 'user' => $this->userPayload($user->fresh())]]);
    }

    private function registerFailure(User $user): void
    {
        DB::transaction(function () use ($user) {
            $u = User::whereKey($user->id)->lockForUpdate()->first();
            $failed = $u->failed_logins + 1;
            $data = ['failed_logins' => $failed];

            if ($failed >= self::MAX_FAILED) {
                $data = ['failed_logins' => 0, 'locked_until' => now()->addMinutes(self::LOCK_MINUTES)];
                Audit::log('auth.locked', $u, ['minutes' => self::LOCK_MINUTES], null, $u->id);
            }

            $u->forceFill($data)->save();
        });
    }

    private function platform(Request $request): ?string
    {
        $p = Str::lower((string) $request->header('X-App-Platform'));

        return in_array($p, config('ppd.platforms'), true) ? $p : null;
    }

    private function activeMemberships(User $user)
    {
        return OrganizationMember::query()
            ->with('organization')
            ->where('user_id', $user->id)
            ->where('status', 'active')
            ->whereHas('organization', fn ($q) => $q->where('status', 'active'))
            ->orderBy('organization_id')
            ->get();
    }

    /** Padre/encargado con al menos un hijo en una organización activa. */
    private function hasActiveChildren(User $user): bool
    {
        return $user->children()->whereHas('organization', fn ($q) => $q->where('status', 'active'))->exists();
    }

    private function userPayload(User $user): array
    {
        return [
            'id' => $user->id,
            'name' => $user->name,
            'email' => $user->email,
            'must_change_password' => (bool) $user->must_change_password,
            'is_super_admin' => (bool) $user->is_super_admin,
        ];
    }

    private function membershipsPayload($memberships): array
    {
        return $memberships->map(fn (OrganizationMember $m) => [
            'organization_id' => $m->organization_id,
            'role' => $m->role->value,
            'role_label' => $m->role->label(),
            'branding_editable' => $m->role === \App\Enums\MemberRole::OrgAdmin && $m->organization->branding_editable_by_org,
            'organization' => $m->organization->brandingPayload(),
        ])->values()->all();
    }
}
