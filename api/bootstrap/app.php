<?php

use App\Http\Middleware\EnsureActiveUser;
use App\Http\Middleware\EnsureSuperAdmin;
use App\Http\Middleware\ForceJsonResponse;
use App\Http\Middleware\Idempotency;
use App\Http\Middleware\ResolveOrganization;
use App\Http\Middleware\SecurityHeaders;
use App\Support\ApiError;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Exceptions\ThrottleRequestsException;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\AccessDeniedHttpException;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;
use Symfony\Component\HttpKernel\Exception\MethodNotAllowedHttpException;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->append(SecurityHeaders::class);
        $middleware->prependToGroup('api', ForceJsonResponse::class);
        $middleware->alias(['idempotent' => Idempotency::class, 'active' => EnsureActiveUser::class, 'org' => ResolveOrganization::class, 'superadmin' => EnsureSuperAdmin::class]);
        // La API usa tokens (sin cookies de sesión): no hay CSRF que verificar en /api.
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request) => $request->is('api/*') || $request->expectsJson(),
        );

        // Nunca registrar contraseñas ni tokens en los logs.
        $exceptions->dontFlash(['password', 'password_confirmation', 'current_password', 'token', 'code', 'totp']);

        $exceptions->render(function (\Throwable $e, Request $request) {
            if (! ($request->is('api/*') || $request->expectsJson())) {
                return null;
            }

            return match (true) {
                $e instanceof ValidationException => ApiError::response(
                    'validation_failed', 'Revise los datos enviados.', 422, ['fields' => $e->errors()]
                ),
                $e instanceof AuthenticationException => ApiError::response(
                    'unauthenticated', 'Su sesión no es válida o expiró. Inicie sesión de nuevo.', 401
                ),
                $e instanceof AuthorizationException, $e instanceof AccessDeniedHttpException => ApiError::response(
                    'forbidden', 'No tiene permiso para realizar esta acción.', 403
                ),
                $e instanceof ModelNotFoundException, $e instanceof NotFoundHttpException => ApiError::response(
                    'not_found', 'No se encontró lo que busca.', 404
                ),
                $e instanceof MethodNotAllowedHttpException => ApiError::response(
                    'method_not_allowed', 'Método no permitido.', 405
                ),
                $e instanceof ThrottleRequestsException => ApiError::response(
                    'too_many_requests', 'Demasiados intentos. Espere un momento e intente de nuevo.', 429
                )->withHeaders($e->getHeaders()),
                $e instanceof HttpExceptionInterface => ApiError::response(
                    'http_error', 'No se pudo completar la solicitud.', $e->getStatusCode()
                ),
                default => config('app.debug') ? null : ApiError::response(
                    'server_error', 'Ocurrió un error. Intente de nuevo más tarde.', 500
                ),
            };
        });
    })->create();
