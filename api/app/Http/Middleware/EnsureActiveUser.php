<?php

namespace App\Http\Middleware;

use App\Support\ApiError;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Después de auth:sanctum. Corta el acceso si el usuario fue desactivado o borrado,
 * y si debe cambiar su contraseña temporal solo deja pasar a las rutas permitidas.
 */
class EnsureActiveUser
{
    /** Rutas que se permiten mientras la contraseña temporal no se ha cambiado. */
    private const ALLOWED_WITH_TEMP_PASSWORD = ['auth.me', 'auth.logout', 'auth.password'];

    /** Cuenta de padre sin correo verificado: solo verificar, reenviar el código, ver su sesión y salir. */
    private const ALLOWED_UNVERIFIED = ['auth.me', 'auth.logout', 'app.auth.verify', 'app.auth.verify_resend'];

    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if (! $user || $user->trashed() || ! $user->isActive()) {
            $user?->currentAccessToken()?->delete();

            return ApiError::response('unauthenticated', 'Su sesión no es válida o expiró. Inicie sesión de nuevo.', 401);
        }

        if ($user->isGuardianAccount() && ! $user->email_verified_at && ! in_array($request->route()?->getName(), self::ALLOWED_UNVERIFIED, true)) {
            return ApiError::response('email_unverified', 'Verifique su correo con el código que le enviamos para continuar.', 403);
        }

        if ($user->must_change_password && ! in_array($request->route()?->getName(), self::ALLOWED_WITH_TEMP_PASSWORD, true)) {
            return ApiError::response('password_change_required', 'Debe cambiar su contraseña temporal antes de continuar.', 403);
        }

        return $next($request);
    }
}
