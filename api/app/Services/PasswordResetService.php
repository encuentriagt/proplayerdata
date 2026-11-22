<?php

namespace App\Services;

use App\Mail\PasswordResetMail;
use App\Models\Organization;
use App\Models\OrganizationMember;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;

final class PasswordResetService
{
    public const EMAIL_MINUTES = 60;

    public const ADMIN_HOURS = 24;

    /** Crea un enlace nuevo (anula los anteriores sin usar) y devuelve el token en claro. */
    public function create(User $user, string $source, ?User $by, \DateTimeInterface $expiresAt): string
    {
        $token = Str::random(48);
        DB::transaction(function () use ($user, $source, $by, $expiresAt, $token) {
            DB::table('password_reset_links')->where('user_id', $user->id)->whereNull('used_at')->update(['used_at' => now()]);
            DB::table('password_reset_links')->insert([
                'user_id' => $user->id, 'token_hash' => hash('sha256', $token), 'source' => $source,
                'created_by' => $by?->id, 'expires_at' => $expiresAt, 'created_at' => now(), 'updated_at' => now(),
            ]);
        });

        return $token;
    }

    /** URL: para staff, la PC de su organización; para padres, la web pública. */
    public function url(User $user, string $token, ?Organization $org = null): string
    {
        $org ??= OrganizationMember::where('user_id', $user->id)->where('status', 'active')->with('organization')->first()?->organization;

        return $org
            ? rtrim(config('ppd.urls.pc'), '/').'/'.$org->slug.'/restablecer?token='.$token
            : rtrim(config('ppd.urls.web'), '/').'/restablecer?token='.$token;
    }

    public function mailAfterResponse(User $user, string $url): void
    {
        app()->terminating(function () use ($user, $url) {
            try {
                Mail::to($user->email)->send(new PasswordResetMail($url, self::EMAIL_MINUTES));
            } catch (\Throwable $e) {
                Log::warning('No se pudo enviar el correo de restablecimiento', ['user_id' => $user->id, 'error' => $e->getMessage()]);
            }
        });
    }

    /** Devuelve el registro vigente del token o null. */
    public function find(string $token): ?object
    {
        if (! preg_match('/^[A-Za-z0-9]{48}$/', $token)) {
            return null;
        }

        return DB::table('password_reset_links')->where('token_hash', hash('sha256', $token))
            ->whereNull('used_at')->where('expires_at', '>', now())->first();
    }
}
