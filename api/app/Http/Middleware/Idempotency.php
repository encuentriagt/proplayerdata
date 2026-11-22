<?php

namespace App\Http\Middleware;

use App\Models\IdempotencyKey;
use App\Support\ApiError;
use Closure;
use Illuminate\Database\QueryException;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Idempotencia por encabezado "Idempotency-Key" (docs/ARQUITECTURA.md, sección 12).
 *
 * Uso en rutas:  ->middleware('idempotent')           opcional
 *                ->middleware('idempotent:required')  obligatorio
 *
 * - Misma clave + mismo contenido  → se devuelve la respuesta guardada (Idempotency-Replayed: true).
 * - Misma clave + contenido distinto → 422 idempotency_key_reused.
 * - Misma clave mientras la primera sigue en proceso → 409 idempotency_in_progress.
 * - Respuestas 5xx no se guardan: el cliente puede reintentar con la misma clave.
 */
class Idempotency
{
    private const METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'];

    public function handle(Request $request, Closure $next, string $mode = 'optional'): Response
    {
        if (! in_array($request->method(), self::METHODS, true)) {
            return $next($request);
        }

        $key = $request->header('Idempotency-Key');

        if ($key === null || $key === '') {
            if ($mode === 'required') {
                return ApiError::response('idempotency_key_required', 'Falta el encabezado Idempotency-Key.', 428);
            }

            return $next($request);
        }

        if (! preg_match('/^[A-Za-z0-9_-]{8,128}$/', $key)) {
            return ApiError::response('idempotency_key_invalid', 'El encabezado Idempotency-Key no es válido.', 422);
        }

        $scope = $request->user()
            ? 'u:'.$request->user()->getAuthIdentifier()
            : 'ip:'.hash('sha256', (string) $request->ip());
        $hash = $this->requestHash($request);

        $existing = IdempotencyKey::where('scope', $scope)->where('idempotency_key', $key)->first();

        if ($existing && $existing->expires_at->isPast()) {
            $existing->delete();
            $existing = null;
        }

        if ($existing) {
            return $this->fromExisting($existing, $hash);
        }

        try {
            $record = IdempotencyKey::create([
                'scope' => $scope,
                'idempotency_key' => $key,
                'method' => $request->method(),
                'path' => mb_substr($request->path(), 0, 255),
                'request_hash' => $hash,
                'status' => 'processing',
                'expires_at' => now()->addHours(config('ppd.idempotency.ttl_hours')),
            ]);
        } catch (QueryException) {
            // Otra petición con la misma clave entró al mismo tiempo (índice único).
            $other = IdempotencyKey::where('scope', $scope)->where('idempotency_key', $key)->first();

            return $other
                ? $this->fromExisting($other, $hash)
                : ApiError::response('idempotency_in_progress', 'La solicitud ya se está procesando.', 409);
        }

        try {
            /** @var Response $response */
            $response = $next($request);
        } catch (\Throwable $e) {
            $record->delete();
            throw $e;
        }

        $code = $response->getStatusCode();
        $body = (string) $response->getContent();

        if ($code >= 500 || strlen($body) > config('ppd.idempotency.max_body_bytes')) {
            $record->delete();

            return $response;
        }

        $record->update([
            'status' => 'completed',
            'response_code' => $code,
            'response_body' => $body,
            'response_content_type' => mb_substr((string) $response->headers->get('Content-Type', 'application/json'), 0, 100),
        ]);

        return $response;
    }

    private function fromExisting(IdempotencyKey $record, string $hash): Response
    {
        if (! hash_equals($record->request_hash, $hash)) {
            return ApiError::response(
                'idempotency_key_reused',
                'Esta clave de idempotencia ya se usó con datos distintos.',
                422
            );
        }

        if ($record->status !== 'completed') {
            return ApiError::response('idempotency_in_progress', 'La solicitud ya se está procesando.', 409)
                ->header('Retry-After', '2');
        }

        return response($record->response_body ?? '', $record->response_code ?? 200)
            ->header('Content-Type', $record->response_content_type ?? 'application/json')
            ->header('Idempotency-Replayed', 'true');
    }

    private function requestHash(Request $request): string
    {
        $payload = $request->all();
        $this->ksortRecursive($payload);

        foreach ($request->allFiles() as $name => $file) {
            $files = is_array($file) ? $file : [$file];
            foreach ($files as $i => $f) {
                $payload['__files'][$name][$i] = hash_file('sha256', $f->getRealPath());
            }
        }

        return hash('sha256', $request->method().'|'.$request->path().'|'.json_encode($payload));
    }

    private function ksortRecursive(array &$array): void
    {
        ksort($array);
        foreach ($array as &$value) {
            if (is_array($value)) {
                $this->ksortRecursive($value);
            }
        }
    }
}
