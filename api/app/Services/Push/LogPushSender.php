<?php

namespace App\Services\Push;

use Illuminate\Support\Facades\Log;

/** Controlador por defecto mientras no hay credenciales de Firebase: solo registra (sin datos personales). */
class LogPushSender implements PushSender
{
    public function send(array $tokens, string $title, string $body, array $data = [], string $channel = 'general'): array
    {
        Log::info('push (log)', ['tokens' => count($tokens), 'channel' => $channel, 'kind' => $data['kind'] ?? null]);

        return array_fill_keys($tokens, 'ok');
    }
}
