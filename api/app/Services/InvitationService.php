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
        'director' => 'Director deportivo',
        'coach' => 'Coach',
        'guardian' => 'Padre, madre o encargado',
    ];

    /** Crea la invitación (revoca las pendientes equivalentes) y devuelve [invitación, token en claro]. */
    public function create(Organization $org, string $email, string $role, ?int $playerId, ?array $teamIds, ?User $by): array
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
            'token_hash' => hash('sha256', $token),
            'expires_at' => now()->addDays((int) config('ppd.invitations.days_valid')),
            'created_by' => $by?->id,
        ]);

        return [$inv, $token];
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

    public static function findByToken(string $token): ?Invitation
    {
        if (! preg_match('/^[A-Za-z0-9]{48}$/', $token)) {
            return null;
        }

        return Invitation::with('organization')->where('token_hash', hash('sha256', $token))->first();
    }
}
