<?php

namespace App\Services;

use App\Models\Device;
use App\Models\UserNotification;
use App\Services\Push\PushSender;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * Avisos a usuarios: bandeja en la app + push (docs/ARQUITECTURA.md, secciones 7 y 16).
 * - Sin cola: la bandeja se escribe al momento; el push sale DESPUÉS de responder (terminating).
 * - Sin duplicados: un mismo (usuario, tipo, ref_key) se avisa una sola vez.
 */
final class NotificationService
{
    public function __construct(private PushSender $sender) {}

    /**
     * @param  int[]  $userIds
     * @return int cantidad de usuarios avisados (sin contar duplicados)
     */
    public function notify(array $userIds, string $kind, string $refKey, string $title, string $body, array $data = [], ?int $organizationId = null, ?int $playerId = null, string $channel = 'general'): int
    {
        $userIds = array_values(array_unique(array_map('intval', $userIds)));
        if (! $userIds) {
            return 0;
        }

        $now = now();
        $fresh = [];
        foreach ($userIds as $uid) {
            // insertOrIgnore respeta el índice único: si ya existe, no se avisa de nuevo.
            $inserted = DB::table('notification_logs')->insertOrIgnore([
                'user_id' => $uid, 'kind' => $kind, 'ref_key' => mb_substr($refKey, 0, 120), 'sent_at' => $now,
            ]);
            if ($inserted) {
                $fresh[] = $uid;
            }
        }
        if (! $fresh) {
            return 0;
        }

        // FCM solo acepta textos en "data".
        $payload = array_map(fn ($v) => is_scalar($v) || $v === null ? (string) $v : json_encode($v), array_merge($data, ['kind' => $kind]));
        foreach (array_chunk($fresh, 200) as $chunk) {
            UserNotification::insert(array_map(fn ($uid) => [
                'user_id' => $uid, 'organization_id' => $organizationId, 'player_id' => $playerId,
                'kind' => $kind, 'title' => mb_substr($title, 0, 150), 'body' => mb_substr($body, 0, 500),
                'data' => json_encode($payload), 'created_at' => $now,
            ], $chunk));
        }

        $sender = $this->sender;
        app()->terminating(function () use ($fresh, $title, $body, $payload, $channel, $sender) {
            try {
                $devices = Device::whereIn('user_id', $fresh)->get(['id', 'fcm_token']);
                if ($devices->isEmpty()) {
                    return;
                }
                $results = $sender->send($devices->pluck('fcm_token')->all(), $title, $body, $payload, $channel);
                $invalid = array_keys(array_filter($results, fn ($r) => $r === 'invalid'));
                if ($invalid) {
                    Device::whereIn('token_hash', array_map(fn ($t) => hash('sha256', $t), $invalid))->delete();
                }
            } catch (\Throwable $e) {
                Log::warning('No se pudo enviar push', ['error' => $e->getMessage()]);
            }
        });

        return count($fresh);
    }
}
