<?php

namespace App\Http\Middleware;

use App\Support\ApiError;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * account:guardian → solo cuentas de padre (App). account:staff → solo staff (PC y Panel).
 * Responde 403 sin dar detalles de la otra cuenta.
 */
class EnsureAccountType
{
    public function handle(Request $request, Closure $next, string $type): Response
    {
        if ($request->user()?->account_type !== $type) {
            return ApiError::response('forbidden', $type === 'guardian'
                ? 'Esta sección es solo para la App de padres.'
                : 'Esta sección es solo para el personal de la institución.', 403);
        }

        return $next($request);
    }
}
