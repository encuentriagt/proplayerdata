<?php

namespace App\Services\Push;

use Illuminate\Http\Client\Pool;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use RuntimeException;

/**
 * Firebase Cloud Messaging HTTP v1 sin paquetes: firma el JWT de la cuenta de servicio con openssl
 * (idea copiada de Trafidoc). La llave JSON vive en storage/app/private (chmod 600), nunca en el repo.
 */
class FcmPushSender implements PushSender
{
    private const SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';

    public function __construct(private string $credentialsPath) {}

    public function send(array $tokens, string $title, string $body, array $data = [], string $channel = 'general'): array
    {
        $tokens = array_values(array_unique(array_filter($tokens)));
        if (! $tokens) {
            return [];
        }

        $creds = $this->credentials();
        $url = "https://fcm.googleapis.com/v1/projects/{$creds['project_id']}/messages:send";
        $access = $this->accessToken($creds);
        $data = array_map('strval', $data);

        $results = [];
        foreach (array_chunk($tokens, 50) as $chunk) {
            $responses = Http::pool(fn (Pool $pool) => array_map(
                fn ($t) => $pool->as($t)->withToken($access)->timeout(10)->post($url, ['message' => [
                    'token' => $t,
                    'notification' => ['title' => $title, 'body' => $body],
                    'data' => $data,
                    'android' => ['priority' => 'high', 'notification' => ['channel_id' => $channel]],
                    'apns' => ['payload' => ['aps' => ['sound' => 'default']]],
                ]]),
                $chunk
            ));

            foreach ($chunk as $t) {
                $r = $responses[$t] ?? null;
                if ($r instanceof \Illuminate\Http\Client\Response && $r->successful()) {
                    $results[$t] = 'ok';
                } elseif ($r instanceof \Illuminate\Http\Client\Response && in_array($r->status(), [400, 404], true)
                    && preg_match('/UNREGISTERED|INVALID_ARGUMENT|registration-token-not-registered/', $r->body())) {
                    $results[$t] = 'invalid';
                } else {
                    $results[$t] = 'error';
                }
            }
        }

        return $results;
    }

    private function credentials(): array
    {
        if (! is_readable($this->credentialsPath)) {
            throw new RuntimeException('No se encontró la llave de Firebase.');
        }
        $c = json_decode((string) file_get_contents($this->credentialsPath), true);
        if (! isset($c['client_email'], $c['private_key'], $c['project_id'])) {
            throw new RuntimeException('La llave de Firebase no es válida.');
        }

        return $c;
    }

    private function accessToken(array $c): string
    {
        return Cache::remember('ppd:fcm:access_token', now()->addMinutes(50), function () use ($c) {
            $now = time();
            $b64 = fn ($v) => rtrim(strtr(base64_encode($v), '+/', '-_'), '=');
            $header = $b64(json_encode(['alg' => 'RS256', 'typ' => 'JWT']));
            $claims = $b64(json_encode([
                'iss' => $c['client_email'], 'scope' => self::SCOPE,
                'aud' => 'https://oauth2.googleapis.com/token', 'iat' => $now, 'exp' => $now + 3600,
            ]));
            $sig = '';
            if (! openssl_sign("$header.$claims", $sig, $c['private_key'], OPENSSL_ALGO_SHA256)) {
                throw new RuntimeException('No se pudo firmar el token de Firebase.');
            }

            $r = Http::asForm()->timeout(10)->post('https://oauth2.googleapis.com/token', [
                'grant_type' => 'urn:ietf:params:oauth:grant-type:jwt-bearer',
                'assertion' => "$header.$claims.".$b64($sig),
            ]);
            if (! $r->successful() || ! $r->json('access_token')) {
                Log::error('FCM: no se obtuvo access token', ['status' => $r->status()]);
                throw new RuntimeException('Firebase rechazó la autenticación.');
            }

            return $r->json('access_token');
        });
    }
}
