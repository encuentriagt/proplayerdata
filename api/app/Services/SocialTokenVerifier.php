<?php

namespace App\Services;

use Firebase\JWT\JWK;
use Firebase\JWT\JWT;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;

/**
 * Verifica el ID token (JWT) que la App recibe de Google o Apple, contra las llaves públicas del proveedor:
 * firma RS256, emisor, destinatario (nuestros client IDs), vencimiento y, si se envía, el nonce.
 * Devuelve ['sub', 'email', 'email_verified', 'name'] o null si no es válido.
 */
class SocialTokenVerifier
{
    private const PROVIDERS = [
        'google' => ['jwks' => 'https://www.googleapis.com/oauth2/v3/certs', 'iss' => ['https://accounts.google.com', 'accounts.google.com']],
        'apple' => ['jwks' => 'https://appleid.apple.com/auth/keys', 'iss' => ['https://appleid.apple.com']],
    ];

    public function audiences(string $provider): array
    {
        return config("ppd.social.{$provider}_client_ids", []);
    }

    public function verify(string $provider, string $idToken, ?string $nonce = null): ?array
    {
        $cfg = self::PROVIDERS[$provider] ?? null;
        $aud = $this->audiences($provider);
        if (! $cfg || ! $aud) {
            return null;
        }
        try {
            JWT::$leeway = 60;
            $claims = (array) JWT::decode($idToken, JWK::parseKeySet($this->keys($provider), 'RS256'));
        } catch (\Throwable) {
            // Puede que el proveedor rotó llaves: se refrescan una vez.
            try {
                Cache::forget("social_jwks:{$provider}");
                $claims = (array) JWT::decode($idToken, JWK::parseKeySet($this->keys($provider), 'RS256'));
            } catch (\Throwable) {
                return null;
            }
        }

        $tokenAud = (array) ($claims['aud'] ?? []);
        if (! in_array($claims['iss'] ?? null, $cfg['iss'], true) || ! array_intersect($tokenAud, $aud) || empty($claims['sub'])) {
            return null;
        }
        if ($nonce !== null) {
            // Apple manda el hash SHA-256 del nonce si la App lo pidió así; se aceptan ambas formas.
            $n = (string) ($claims['nonce'] ?? '');
            if (! hash_equals($n, $nonce) && ! hash_equals($n, hash('sha256', $nonce))) {
                return null;
            }
        }
        $verified = $claims['email_verified'] ?? false;

        return [
            'sub' => (string) $claims['sub'],
            'email' => isset($claims['email']) ? strtolower(trim((string) $claims['email'])) : null,
            'email_verified' => $verified === true || $verified === 'true',
            'name' => isset($claims['name']) ? trim((string) $claims['name']) : null,
        ];
    }

    private function keys(string $provider): array
    {
        return Cache::remember("social_jwks:{$provider}", now()->addHours(6), function () use ($provider) {
            return Http::timeout(8)->retry(1, 300)->get(self::PROVIDERS[$provider]['jwks'])->throw()->json();
        });
    }
}
