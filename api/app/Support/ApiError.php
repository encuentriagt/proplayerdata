<?php

namespace App\Support;

use Illuminate\Http\JsonResponse;

/**
 * Formato único de error de la API:
 * { "error": { "code": "codigo_estable", "message": "Texto en español para el usuario" } }
 * Los clientes deciden por "code" (estable); "message" se puede mostrar tal cual.
 */
final class ApiError
{
    public static function response(string $code, string $message, int $status, array $extra = []): JsonResponse
    {
        return response()->json(['error' => array_merge(['code' => $code, 'message' => $message], $extra)], $status);
    }
}
