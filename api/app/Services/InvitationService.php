<?php

namespace App\Services;

use App\Mail\InvitationMail;
use App\Models\Invitation;
use App\Models\Organization;
use App\Models\User;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;

final class InvitationService
{
    public const ROLE_LABELS = [
        'org_admin' => 'Administrador',
        'director' => 'Director técnico',
        'coach' => 'Coach',
        'guardian' => 'Padre, madre o encargado',
    ];

    /** Crea la invitación (revoca las pendientes equivalentes) y devuelve [invitación, token en claro]. */
    public function create(Organization $org, string $email, string $role, ?int $playerId, ?array $teamIds, ?User $by, ?array $sportIds = null): array
    {
        $email = Str::lower(trim($email));

        Invitation::where('organization_id', $org->id)->where('email', $email)->where('role', $role)
            ->when($playerId, fn ($q) => $q->where('player_id', $playerId))
            ->whereNull('accepted_at')->whereNull('revoked_at')
            ->update(['revoked_at' => now()]);

        $token = Str::random(48);
        $inv = Invitation::create([
            'organization_id' => $org->id,
            'email' => $email,
            'role' => $role,
            'player_id' => $playerId,
            'team_ids' => $teamIds ? array_values(array_unique(array_map('intval', $teamIds))) : null,
            'sport_ids' => $sportIds ? array_values(array_unique(array_map('intval', $sportIds))) : null,
            'token_hash' => hash('sha256', $token),
            // Padres: código corto para escribir en la App (sin letras ni números confusos).
            'code' => $role === 'guardian' ? self::newCode() : null,
            'expires_at' => now()->addDays((int) config('ppd.invitations.days_valid')),
            'created_by' => $by?->id,
        ]);

        if ($role === 'guardian' && $playerId) {
            $this->notifyExistingGuardian($inv);
        }

        return [$inv, $token];
    }

    /** Si el padre ya tiene cuenta verificada con ese correo, le llega un aviso en la App (kind link_invitation). */
    private function notifyExistingGuardian(Invitation $inv): void
    {
        $guardian = User::guardians()->where('email', $inv->email)->whereNotNull('email_verified_at')->where('status', 'active')->first();
        if (! $guardian) {
            return;
        }
        $child = \App\Models\Player::find($inv->player_id)?->first_name ?? 'su hijo o hija';
        $org = $inv->organization()->value('name');
        app(NotificationService::class)->notify(
            [$guardian->id], 'link_invitation', "invitation:{$inv->id}",
            'Nueva invitación',
            "{$org} lo invita a seguir a {$child}. Acéptela en Invitaciones.",
            ['invitation_id' => $inv->id, 'organization_id' => $inv->organization_id, 'organization_name' => $org, 'child_name' => $child],
            $inv->organization_id, $inv->player_id,
        );
    }

    public function url(Invitation $inv, string $token): string
    {
        $slug = $inv->organization->slug;

        return $inv->role === 'guardian'
            ? rtrim(config('ppd.urls.web'), '/').'/invitacion?token='.$token
            : rtrim(config('ppd.urls.pc'), '/').'/'.$slug.'/invitacion?token='.$token;
    }

    /** Envía el correo después de responder (sin cola). Un fallo de correo no rompe nada. */
    public function sendAfterResponse(Invitation $inv, string $token): void
    {
        $url = $this->url($inv, $token);
        $label = self::ROLE_LABELS[$inv->role] ?? $inv->role;

        app()->terminating(function () use ($inv, $url, $label) {
            try {
                Mail::to($inv->email)->send(new InvitationMail($inv->loadMissing('organization'), $url, $label));
            } catch (\Throwable $e) {
                Log::warning('No se pudo enviar la invitación', ['invitation_id' => $inv->id, 'error' => $e->getMessage()]);
            }
        });
    }

    public static function newCode(): string
    {
        $abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        do {
            $raw = '';
            for ($i = 0; $i < 8; $i++) {
                $raw .= $abc[random_int(0, strlen($abc) - 1)];
            }
            $code = substr($raw, 0, 4).'-'.substr($raw, 4);
        } while (Invitation::where('code', $code)->exists());

        return $code;
    }

    /** "abcd 2345", "ABCD-2345" → "ABCD-2345". */
    public static function normalizeCode(string $code): string
    {
        $c = strtoupper(preg_replace('/[^A-Za-z0-9]/', '', $code));

        return strlen($c) === 8 ? substr($c, 0, 4).'-'.substr($c, 4) : $c;
    }

    public static function findByToken(string $token): ?Invitation
    {
        if (! preg_match('/^[A-Za-z0-9]{48}$/', $token)) {
            return null;
        }

        return Invitation::with('organization')->where('token_hash', hash('sha256', $token))->first();
    }
}
