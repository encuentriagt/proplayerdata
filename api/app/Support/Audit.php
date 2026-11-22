<?php

namespace App\Support;

use App\Models\AuditLog;
use Illuminate\Database\Eloquent\Model;

/**
 * Auditoría (docs/ARQUITECTURA.md, sección 12). Nunca guardar contraseñas, tokens ni datos médicos en $data.
 */
final class Audit
{
    private const FORBIDDEN_KEYS = ['password', 'token', 'secret', 'totp', 'code', 'apple_refresh_token'];

    public static function log(string $action, ?Model $target = null, array $data = [], ?int $organizationId = null, ?int $actorId = null): AuditLog
    {
        $request = app()->runningInConsole() ? null : request();

        foreach (array_keys($data) as $k) {
            foreach (self::FORBIDDEN_KEYS as $bad) {
                if (str_contains(strtolower((string) $k), $bad)) {
                    unset($data[$k]);
                }
            }
        }

        return AuditLog::create([
            'actor_user_id' => $actorId ?? $request?->user()?->getAuthIdentifier(),
            'organization_id' => $organizationId,
            'action' => $action,
            'target_type' => $target ? class_basename($target) : null,
            'target_id' => $target?->getKey(),
            'data' => $data ?: null,
            'ip' => $request?->ip() ?? (app()->runningInConsole() ? 'cli' : null),
            'user_agent' => $request ? mb_substr((string) $request->userAgent(), 0, 255) : null,
        ]);
    }
}
