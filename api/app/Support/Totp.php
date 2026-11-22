<?php

namespace App\Support;

use Illuminate\Support\Facades\Cache;

/** TOTP RFC 6238 (SHA1, 30 s, 6 dígitos) sin paquetes, con protección contra reutilizar un código. */
final class Totp
{
    private const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

    public static function generateSecret(int $bytes = 20): string
    {
        $raw = random_bytes($bytes);
        $bits = '';
        foreach (str_split($raw) as $c) {
            $bits .= str_pad(decbin(ord($c)), 8, '0', STR_PAD_LEFT);
        }
        $out = '';
        foreach (str_split($bits, 5) as $chunk) {
            $out .= self::ALPHABET[bindec(str_pad($chunk, 5, '0'))];
        }

        return $out;
    }

    public static function uri(string $secret, string $account, string $issuer = 'ppd'): string
    {
        return 'otpauth://totp/'.rawurlencode($issuer.':'.$account).'?secret='.$secret.'&issuer='.rawurlencode($issuer).'&algorithm=SHA1&digits=6&period=30';
    }

    public static function code(string $secret, int $step): string
    {
        $key = self::base32Decode($secret);
        $hash = hash_hmac('sha1', pack('N*', 0, $step), $key, true);
        $offset = ord($hash[19]) & 0x0F;
        $num = ((ord($hash[$offset]) & 0x7F) << 24) | (ord($hash[$offset + 1]) << 16) | (ord($hash[$offset + 2]) << 8) | ord($hash[$offset + 3]);

        return str_pad((string) ($num % 1_000_000), 6, '0', STR_PAD_LEFT);
    }

    /** Verifica con ventana de ±1 paso y rechaza códigos ya usados por ese usuario. */
    public static function verify(string $secret, string $code, int|string $userKey, ?int $now = null): bool
    {
        if (! preg_match('/^\d{6}$/', $code)) {
            return false;
        }
        $step = intdiv($now ?? time(), 30);
        $lastKey = "ppd:totp:last:$userKey";
        $last = (int) Cache::get($lastKey, 0);

        foreach ([-1, 0, 1] as $d) {
            $s = $step + $d;
            if ($s > $last && hash_equals(self::code($secret, $s), $code)) {
                Cache::put($lastKey, $s, now()->addMinutes(5));

                return true;
            }
        }

        return false;
    }

    private static function base32Decode(string $s): string
    {
        $s = strtoupper(rtrim($s, '='));
        $bits = '';
        foreach (str_split($s) as $c) {
            $i = strpos(self::ALPHABET, $c);
            if ($i === false) {
                continue;
            }
            $bits .= str_pad(decbin($i), 5, '0', STR_PAD_LEFT);
        }
        $out = '';
        foreach (str_split($bits, 8) as $byte) {
            if (strlen($byte) === 8) {
                $out .= chr(bindec($byte));
            }
        }

        return $out;
    }
}
