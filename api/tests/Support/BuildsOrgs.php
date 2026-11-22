<?php

namespace Tests\Support;

use App\Models\Organization;
use App\Models\Player;
use App\Models\Sport;
use App\Models\Team;
use App\Models\TeamPlayer;
use App\Models\TeamStaff;
use App\Models\User;
use Laravel\Sanctum\Sanctum;

trait BuildsOrgs
{
    protected function makeOrg(string $slug = 'colegio-demo', string $status = 'active'): Organization
    {
        return Organization::create(['name' => 'Org '.$slug, 'slug' => $slug, 'type' => 'school', 'status' => $status]);
    }

    protected function makeUser(string $email, array $attrs = []): User
    {
        $u = new User(['name' => ucfirst(strtok($email, '@')), 'email' => $email, 'password' => 'ClaveSegura2026']);
        $u->forceFill(array_merge(['status' => 'active'], $attrs))->save();

        return $u->refresh();
    }

    protected function member(Organization $org, string $email, string $role): User
    {
        $u = User::where('email', $email)->first() ?? $this->makeUser($email);
        $org->members()->create(['user_id' => $u->id, 'role' => $role, 'status' => 'active']);

        return $u;
    }

    protected function team(Organization $org, string $name = 'Sub-12', string $sport = 'futbol'): Team
    {
        return $org->teams()->create(['name' => $name, 'sport_id' => Sport::where('code', $sport)->value('id')]);
    }

    protected function assign(Team $team, User $user): void
    {
        TeamStaff::create(['team_id' => $team->id, 'user_id' => $user->id, 'role' => 'head_coach']);
    }

    protected function player(Organization $org, ?Team $team = null, string $first = 'Ana', string $last = 'López'): Player
    {
        $p = $org->players()->create(['first_name' => $first, 'last_name' => $last]);
        if ($team) {
            TeamPlayer::create(['team_id' => $team->id, 'player_id' => $p->id]);
        }

        return $p;
    }

    protected function as(User $u): static
    {
        $this->app['auth']->forgetGuards();
        Sanctum::actingAs($u, ['*']);

        return $this;
    }
}
