<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Http\Middleware\EnsureSuperAdmin;
use App\Support\ApiError;
use App\Support\Audit;
use App\Support\Totp;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;

/** Código de verificación (TOTP) del super admin. */
class TotpController extends Controller
{
    /** Genera el secreto (se muestra una sola vez). Solo si todavía no está confirmado. */
    public function setup(Request $request): JsonResponse
    {
        $user = $request->user();
        if (! $user->is_super_admin) {
            return ApiError::response('forbidden', 'No tiene permiso para realizar esta acción.', 403);
        }
        if ($user->totp_confirmed_at) {
            return ApiError::response('totp_already_enabled', 'El código de verificación ya está activo.', 409);
        }

        $secret = Totp::generateSecret();
        $user->forceFill(['totp_secret' => $secret])->save();

        return response()->json(['data' => ['secret' => $secret, 'otpauth_uri' => Totp::uri($secret, $user->email)]]);
    }

    public function confirm(Request $request): JsonResponse
    {
        $user = $request->user();
        $request->validate(['code' => ['required', 'string', 'size:6']]);
        if (! $user->is_super_admin || ! $user->totp_secret || $user->totp_confirmed_at) {
            return ApiError::response('forbidden', 'No tiene permiso para realizar esta acción.', 403);
        }
        if (! Totp::verify($user->totp_secret, $request->string('code'), $user->id)) {
            return ApiError::response('totp_invalid', 'El código no es correcto.', 422);
        }

        $user->forceFill(['totp_confirmed_at' => now()])->save();
        $this->elevate($request);
        Audit::log('auth.totp_enabled', $user);

        return response()->json(['data' => ['ok' => true]]);
    }

    public function verify(Request $request): JsonResponse
    {
        $user = $request->user();
        $request->validate(['code' => ['required', 'string', 'size:6']]);
        if (! $user->is_super_admin || ! $user->totp_confirmed_at) {
            return ApiError::response('forbidden', 'No tiene permiso para realizar esta acción.', 403);
        }
        if (! Totp::verify($user->totp_secret, $request->string('code'), $user->id)) {
            Audit::log('auth.totp_failed', $user);

            return ApiError::response('totp_invalid', 'El código no es correcto.', 422);
        }

        $this->elevate($request);
        Audit::log('auth.totp_verified', $user);

        return response()->json(['data' => ['ok' => true, 'idle_minutes' => EnsureSuperAdmin::IDLE_MINUTES]]);
    }

    private function elevate(Request $request): void
    {
        $token = $request->user()->currentAccessToken();
        if ($token && isset($token->id)) {
            Cache::put(EnsureSuperAdmin::key($token->id), true, now()->addMinutes(EnsureSuperAdmin::IDLE_MINUTES));
        }
    }
}
