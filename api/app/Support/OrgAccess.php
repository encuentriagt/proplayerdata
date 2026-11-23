<?php

namespace App\Support;

use App\Enums\MemberRole;
use App\Models\DirectorScope;
use App\Models\Organization;
use App\Models\OrganizationMember;
use App\Models\Player;
use App\Models\Team;
use App\Models\TeamPlayer;
use App\Models\TeamStaff;
use App\Models\User;
use Illuminate\Auth\Access\AuthorizationException;

/**
 * Permisos dentro de una organización (docs/ARQUITECTURA.md, sección 2, v1.4).
 *
 * - org_admin: ve y maneja TODO, incluidos los directores técnicos. Invita cualquier rol.
 * - director (técnico): solo su ALCANCE (deportes completos y/o equipos sueltos que le asignó el admin).
 *   Dentro de su alcance ve todo, crea y edita equipos de sus deportes, invita coaches y padres,
 *   asigna coaches a sus equipos y administra a esos coaches. Nunca crea ni ve otros directores o admins.
 * - coach: solo los equipos que le asignaron. Calendario, convocatorias, asistencia, ficha,
 *   registrar/enrolar/desenrolar jugadores de sus equipos e invitar padres. No ve a otros coaches.
 */
final class OrgAccess
{
    private ?array $teamIdsCache = null;

    private ?array $scopeCache = null;

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

    public function isCoach(): bool
    {
        return $this->has(MemberRole::Coach);
    }

    /** Solo el admin ve toda la organización. */
    public function seesAllTeams(): bool
    {
        return $this->isAdmin();
    }

    /** Alcance del director: ['sport_ids' => [...], 'team_ids' => [...]]. */
    public function directorScope(): array
    {
        if ($this->scopeCache !== null) {
            return $this->scopeCache;
        }
        if (! $this->isDirector()) {
            return $this->scopeCache = ['sport_ids' => [], 'team_ids' => []];
        }
        $rows = DirectorScope::where('organization_id', $this->organization->id)->where('user_id', $this->user->id)->get();

        return $this->scopeCache = [
            'sport_ids' => $rows->whereNotNull('sport_id')->pluck('sport_id')->map(fn ($i) => (int) $i)->unique()->values()->all(),
            'team_ids' => $rows->whereNotNull('team_id')->pluck('team_id')->map(fn ($i) => (int) $i)->unique()->values()->all(),
        ];
    }

    /** Equipos que el director maneja (de sus deportes o asignados uno a uno). */
    public function directedTeamIds(): array
    {
        $scope = $this->directorScope();
        if (! $scope['sport_ids'] && ! $scope['team_ids']) {
            return [];
        }

        return Team::where('organization_id', $this->organization->id)
            ->where(fn ($q) => $q->whereIn('sport_id', $scope['sport_ids'] ?: [0])->orWhereIn('id', $scope['team_ids'] ?: [0]))
            ->pluck('id')->map(fn ($i) => (int) $i)->all();
    }

    /** Equipos visibles: admin todos; director su alcance; coach sus equipos asignados. */
    public function teamIds(): array
    {
        if ($this->teamIdsCache !== null) {
            return $this->teamIdsCache;
        }
        if ($this->seesAllTeams()) {
            return $this->teamIdsCache = Team::where('organization_id', $this->organization->id)->pluck('id')->map(fn ($i) => (int) $i)->all();
        }

        $coached = TeamStaff::where('user_id', $this->user->id)
            ->whereIn('team_id', Team::where('organization_id', $this->organization->id)->select('id'))
            ->pluck('team_id')->map(fn ($i) => (int) $i)->all();

        return $this->teamIdsCache = array_values(array_unique(array_merge($coached, $this->directedTeamIds())));
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

    /** Editar/borrar el equipo y asignar su staff: admin, o director con ese equipo en su alcance. */
    public function canManageTeam(Team $team): bool
    {
        if ($team->organization_id !== $this->organization->id) {
            return false;
        }

        return $this->isAdmin() || in_array($team->id, $this->directedTeamIds(), true);
    }

    /** Crear equipos de un deporte: admin, o director con ese deporte completo asignado. */
    public function canCreateTeamInSport(int $sportId): bool
    {
        return $this->isAdmin() || in_array($sportId, $this->directorScope()['sport_ids'], true);
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

    /** Roles que puede invitar. */
    public function invitableRoles(): array
    {
        if ($this->isAdmin()) {
            return ['org_admin', 'director', 'coach', 'guardian'];
        }
        if ($this->isDirector()) {
            return ['coach', 'guardian'];
        }

        return ['guardian'];
    }

    /** Ver y administrar a un miembro: admin a todos; director solo a coaches cuyos equipos estén dentro de su alcance. */
    public function canManageMember(OrganizationMember $member): bool
    {
        if ($member->organization_id !== $this->organization->id) {
            return false;
        }
        if ($this->isAdmin()) {
            return true;
        }
        if (! $this->isDirector() || $member->role !== MemberRole::Coach) {
            return false;
        }
        // Un coach que también es director o admin no lo administra un director.
        $otherRoles = OrganizationMember::where('organization_id', $this->organization->id)
            ->where('user_id', $member->user_id)->where('role', '!=', 'coach')->exists();
        if ($otherRoles) {
            return false;
        }
        $coachTeams = TeamStaff::where('user_id', $member->user_id)
            ->whereIn('team_id', Team::where('organization_id', $this->organization->id)->select('id'))
            ->pluck('team_id')->map(fn ($i) => (int) $i)->all();

        return ! array_diff($coachTeams, $this->directedTeamIds());
    }

    /** Resumen de permisos para que la PC muestre u oculte opciones (la API igual valida todo). */
    public function permissions(): array
    {
        return [
            'invite_roles' => $this->invitableRoles(),
            'manage_members' => $this->isAdmin() || $this->isDirector(),
            'manage_directors' => $this->isAdmin(),
            'manage_seasons' => $this->isAdmin(),
            'manage_plans' => $this->isAdmin(),
            'manage_branding' => $this->isAdmin() && $this->organization->branding_editable_by_org,
            'create_teams' => $this->isAdmin() ? 'all' : $this->directorScope()['sport_ids'],
            'delete_players' => $this->isAdmin(),
            'director_scope' => $this->isDirector() ? $this->directorScope() : null,
        ];
    }

    public function authorize(bool $allowed): void
    {
        if (! $allowed) {
            throw new AuthorizationException;
        }
    }
}
