<?php

namespace Tests\Feature;

use App\Models\UserNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Support\BuildsOrgs;
use Tests\TestCase;

/** Al publicar un partido: padres de los convocados + admins y super admins que lo activaron. */
class StaffAlertsTest extends TestCase
{
    use BuildsOrgs, RefreshDatabase;

    private string $base = '/api/pc/orgs/colegio-demo';

    public function test_admin_y_super_admin_reciben_solo_si_lo_activan(): void
    {
        $org = $this->makeOrg();
        $otra = $this->makeOrg('otra');
        $team = $this->team($org, 'Sub-12');
        $admin = $this->member($org, 'a@x.test', 'org_admin');
        $admin2 = $this->member($org, 'a2@x.test', 'org_admin');
        $coach = $this->member($org, 'c@x.test', 'coach');
        $this->assign($team, $coach);
        $ana = $this->player($org, $team, 'Ana');
        $papa = $this->makeUser('p@x.test');
        \App\Models\GuardianPlayer::create(['user_id' => $papa->id, 'player_id' => $ana->id]);
        $beto = $this->player($org, $team, 'Beto');
        $mamaBeto = $this->makeUser('m@x.test');
        \App\Models\GuardianPlayer::create(['user_id' => $mamaBeto->id, 'player_id' => $beto->id]);
        $super = $this->makeUser('s@x.test', ['is_super_admin' => true]);
        $st = $this->withHeaders(['X-App-Platform' => 'web'])->postJson('/api/auth/login', ['email' => 's@x.test', 'password' => 'ClaveSegura2026'])->json('data.token');
        $secret = $this->withToken($st)->postJson('/api/auth/totp/setup')->json('data.secret');
        $this->withToken($st)->postJson('/api/auth/totp/confirm', ['code' => \App\Support\Totp::code($secret, intdiv(time(), 30))])->assertOk();
        $superPut = function (array $body) use ($st) {
            $this->app['auth']->forgetGuards();
            $r = $this->withToken($st)->putJson('/api/admin/notification-prefs', $body)->assertOk();
            $this->flushHeaders();
            $this->app['auth']->forgetGuards();

            return $r;
        };
        $this->flushHeaders();
        $this->app['auth']->forgetGuards();

        // Permisos y preferencias.
        $this->as($admin)->getJson($this->base.'/access')->assertJsonPath('data.permissions.staff_alerts', true);
        $this->as($coach)->getJson($this->base.'/notification-prefs')->assertForbidden();
        $this->as($admin)->getJson($this->base.'/notification-prefs')->assertJsonPath('data.match_published', false);
        $this->as($admin)->putJson($this->base.'/notification-prefs', ['match_published' => true])->assertOk()->assertJsonPath('data.match_published', true);

        $publish = function () use ($coach, $team, $ana) {
            return $this->as($coach)->postJson($this->base.'/events', ['team_id' => $team->id, 'type' => 'match', 'starts_at' => now()->addDays(2)->toDateTimeString(),
                'opponent_name' => 'Rival', 'publish' => true, 'callups' => [['player_id' => $ana->id]]])->assertCreated()->json('data.id');
        };
        $id = $publish();

        $kinds = fn ($u) => UserNotification::where('user_id', $u->id)->pluck('kind')->all();
        $this->assertSame(['callup'], $kinds($papa));          // padre del convocado
        $this->assertSame([], $kinds($mamaBeto));              // padre de no convocado: nada
        $this->assertSame(['match_published'], $kinds($admin)); // admin suscrito
        $this->assertSame([], $kinds($admin2));                 // admin no suscrito
        $this->assertSame([], $kinds($super));                  // super admin no suscrito
        $this->assertStringContainsString('Sub-12 vs Rival', UserNotification::where('user_id', $admin->id)->value('title'));

        // Super admin: solo la otra organización → no recibe; luego todas → sí.
        $superPut(['match_published' => true, 'organization_ids' => [$otra->id]])
            ->assertJsonPath('data.organization_ids', [$otra->id]);
        $publish();
        $this->assertSame([], $kinds($super));
        $superPut(['match_published' => true, 'organization_ids' => null])
            ->assertJsonPath('data.organization_ids', null);
        $publish();
        $this->assertSame(['match_published'], $kinds($super));

        // Quien publica no se avisa a sí mismo; desactivar funciona.
        $this->as($admin)->postJson($this->base.'/events', ['team_id' => $team->id, 'type' => 'match', 'starts_at' => now()->addDays(3)->toDateTimeString(),
            'opponent_name' => 'Otro', 'publish' => true, 'callups' => [['player_id' => $ana->id]]])->assertCreated();
        $this->assertCount(3, $kinds($admin));
        $this->as($admin)->putJson($this->base.'/notification-prefs', ['match_published' => false])->assertOk();
        $publish();
        $this->assertCount(3, $kinds($admin));

        // Un admin que deja de serlo ya no recibe aunque tuviera la suscripción.
        $this->as($admin2)->putJson($this->base.'/notification-prefs', ['match_published' => true])->assertOk();
        \App\Models\OrganizationMember::where('user_id', $admin2->id)->update(['status' => 'disabled']);
        $publish();
        $this->assertSame([], $kinds($admin2));
    }

    public function test_publicar_borrador_avisa_al_staff_una_vez(): void
    {
        $org = $this->makeOrg();
        $team = $this->team($org, 'Sub-12');
        $admin = $this->member($org, 'a@x.test', 'org_admin');
        $coach = $this->member($org, 'c@x.test', 'coach');
        $this->assign($team, $coach);
        $ana = $this->player($org, $team, 'Ana');
        $this->as($admin)->putJson($this->base.'/notification-prefs', ['match_published' => true])->assertOk();
        $id = $this->as($coach)->postJson($this->base.'/events', ['team_id' => $team->id, 'type' => 'match', 'starts_at' => now()->addDays(2)->toDateTimeString(),
            'opponent_name' => 'R', 'publish' => false, 'callups' => [['player_id' => $ana->id]]])->json('data.id');
        $this->assertSame(0, UserNotification::where('user_id', $admin->id)->count());
        $this->as($coach)->postJson($this->base."/events/{$id}/publish")->assertOk();
        $this->as($coach)->postJson($this->base."/events/{$id}/publish")->assertOk();
        $this->assertSame(1, UserNotification::where('user_id', $admin->id)->where('kind', 'match_published')->count());
    }
}
