<?php

namespace App\Http\Middleware;

use App\Support\ApiError;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Symfony\Component\HttpFoundation\Response;

/**
 * /api/admin/*: super admin con código TOTP verificado en ESTA sesión.
 * La verificación dura 30 minutos sin uso (se renueva con cada petición).
 */
class EnsureSuperAdmin
{
    public const IDLE_MINUTES = 30;

    public static function key(int $tokenId): string
    {
        return "ppd:admin:verified:$tokenId";
    }

    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();
        $token = $user?->currentAccessToken();

        if (! $user?->is_super_admin || ! $token || ! isset($token->id)) {
            return ApiError::response('forbidden', 'No tiene permiso para realizar esta acción.', 403);
        }
        if (! $user->totp_confirmed_at) {
            return ApiError::response('totp_setup_required', 'Debe activar el código de verificación (TOTP).', 403);
        }
        if (! Cache::has(self::key($token->id))) {
            return ApiError::response('totp_required', 'Ingrese su código de verificación.', 403);
        }

        Cache::put(self::key($token->id), true, now()->addMinutes(self::IDLE_MINUTES));

        return $next($request);
    }
}
