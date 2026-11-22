<?php

namespace App\Support;

use App\Enums\MemberRole;
use App\Models\Organization;
use App\Models\Player;
use App\Models\Team;
use App\Models\TeamPlayer;
use App\Models\TeamStaff;
use App\Models\User;
use Illuminate\Auth\Access\AuthorizationException;

/**
 * Permisos dentro de una organización (docs/ARQUITECTURA.md, sección 2).
 * - org_admin: todo en su organización.
 * - director: ve y registra en TODOS los equipos; no administra equipos ni miembros.
 * - coach: solo los equipos que la organización le asignó (team_staff).
 * Se crea en el middleware "org" y se inyecta en los controladores.
 */
final class OrgAccess
{
    /** @var array<int,int>|null */
    private ?array $teamIdsCache = null;

    /** @param MemberRole[] $roles */
    public function __construct(
        public readonly Organization $organization,
        public readonly User $user,
        public readonly array $roles,
    ) {}

    public function has(MemberRole $role): bool
    {
        return in_array($role, $this->roles, true);
    }

    public function isAdmin(): bool
    {
        return $this->has(MemberRole::OrgAdmin);
    }

    public function isDirector(): bool
    {
        return $this->has(MemberRole::Director);
    }

    public function seesAllTeams(): bool
    {
        return $this->isAdmin() || $this->isDirector();
    }

    /** IDs de equipos visibles para este usuario en esta organización. */
    public function teamIds(): array
    {
        if ($this->teamIdsCache !== null) {
            return $this->teamIdsCache;
        }

        $q = Team::where('organization_id', $this->organization->id);
        if (! $this->seesAllTeams()) {
            $q->whereIn('id', TeamStaff::where('user_id', $this->user->id)->select('team_id'));
        }

        return $this->teamIdsCache = $q->pluck('id')->map(fn ($id) => (int) $id)->all();
    }

    public function canViewTeam(Team $team): bool
    {
        return $team->organization_id === $this->organization->id && in_array($team->id, $this->teamIds(), true);
    }

    /** Registrar actividad del equipo: calendario, convocatorias, asistencia, ficha, plantilla. */
    public function canWorkOnTeam(Team $team): bool
    {
        return $this->canViewTeam($team);
    }

    public function canViewPlayer(Player $player): bool
    {
        if ($player->organization_id !== $this->organization->id) {
            return false;
        }
        if ($this->seesAllTeams()) {
            return true;
        }

        return TeamPlayer::where('player_id', $player->id)->whereIn('team_id', $this->teamIds())->exists();
    }

    public function authorize(bool $allowed): void
    {
        if (! $allowed) {
            throw new AuthorizationException;
        }
    }
}
