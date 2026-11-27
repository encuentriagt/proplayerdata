<?php

namespace App\Services;

use App\Mail\EmailCodeMail;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;

/**
 * Códigos de 6 dígitos por correo: vencen en 15 min, máx. 5 intentos, uno vigente por propósito.
 * El código nunca se guarda en claro (HMAC con APP_KEY).
 */
class EmailCodeService
{
    public const MINUTES = 15;

    private const MAX_ATTEMPTS = 5;

    /** Crea un código nuevo (anula los anteriores del mismo propósito) y lo envía después de responder. */
    public function send(User $user, string $purpose): void
    {
        $code = str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);
        DB::transaction(function () use ($user, $purpose, $code) {
            DB::table('email_codes')->where('user_id', $user->id)->where('purpose', $purpose)->whereNull('used_at')->update(['used_at' => now()]);
            DB::table('email_codes')->insert([
                'user_id' => $user->id, 'purpose' => $purpose, 'code_hash' => $this->hash($code),
                'expires_at' => now()->addMinutes(self::MINUTES), 'created_at' => now(), 'updated_at' => now(),
            ]);
        });
        $email = $user->email;
        app()->terminating(function () use ($email, $code, $purpose) {
            try {
                Mail::to($email)->send(new EmailCodeMail($code, $purpose, self::MINUTES));
            } catch (\Throwable $e) {
                Log::warning('No se pudo enviar el código por correo.', ['purpose' => $purpose, 'error' => $e->getMessage()]);
            }
        });
        if (app()->runningUnitTests()) {
            app()->instance("test.email_code.{$user->id}.{$purpose}", $code);
        }
    }

    /** true si el código es correcto y vigente (lo marca usado). Cuenta intentos fallidos. */
    public function consume(User $user, string $purpose, string $code): bool
    {
        return DB::transaction(function () use ($user, $purpose, $code) {
            $row = DB::table('email_codes')->where('user_id', $user->id)->where('purpose', $purpose)
                ->whereNull('used_at')->where('expires_at', '>', now())->orderByDesc('id')->lockForUpdate()->first();
            if (! $row || $row->attempts >= self::MAX_ATTEMPTS) {
                return false;
            }
            if (! hash_equals($row->code_hash, $this->hash($code))) {
                DB::table('email_codes')->where('id', $row->id)->increment('attempts');

                return false;
            }
            DB::table('email_codes')->where('id', $row->id)->update(['used_at' => now()]);

            return true;
        });
    }

    private function hash(string $code): string
    {
        return hash_hmac('sha256', $code, (string) config('app.key'));
    }
}
