<?php

namespace Tests\Feature;

use App\Mail\InvitationMail;
use App\Models\GuardianPlayer;
use App\Models\Invitation;
use App\Models\OrganizationMember;
use App\Models\TeamStaff;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Tests\Support\BuildsOrgs;
use Tests\TestCase;

class InvitationTest extends TestCase
{
    use BuildsOrgs, RefreshDatabase;

    private string $base = '/api/pc/orgs/colegio-demo';

    private function tokenFrom(string $url): string
    {
        parse_str(parse_url($url, PHP_URL_QUERY), $q);

        return $q['token'];
    }

    public function test_admin_invita_coach_con_equipos_y_se_acepta_con_usuario_nuevo(): void
    {
        Mail::fake();
        $org = $this->makeOrg();
        $team = $this->team($org);
        $admin = $this->member($org, 'a@x.test', 'org_admin');

        $r = $this->as($admin)->postJson($this->base.'/invitations', ['email' => 'Nuevo.Coach@X.test', 'role' => 'coach', 'team_ids' => [$team->id]])
            ->assertCreated()->assertJsonPath('data.email', 'nuevo.coach@x.test');
        $url = $r->json('data.invite_url');
        $this->assertStringStartsWith('https://pc.ppdguate.com/colegio-demo/invitacion?token=', $url);
        $token = $this->tokenFrom($url);

        // El token no se guarda en claro.
        $this->assertNull(Invitation::where('token_hash', $token)->first());
        Mail::assertSent(InvitationMail::class, fn ($m) => $m->hasTo('nuevo.coach@x.test'));

        $this->app['auth']->forgetGuards();
        $this->getJson("/api/public/invitations/{$token}")->assertOk()
            ->assertJsonPath('data.status', 'pending')->assertJsonPath('data.role', 'coach')
            ->assertJsonPath('data.user_exists', false)->assertJsonPath('data.email_masked', 'nu*********@x.test');

        $this->postJson("/api/public/invitations/{$token}/accept", ['name' => 'Coach Nuevo', 'password' => 'corta', 'password_confirmation' => 'corta'])->assertStatus(422);
        $this->postJson("/api/public/invitations/{$token}/accept", ['name' => 'Coach Nuevo', 'password' => 'ClaveCoach2026', 'password_confirmation' => 'ClaveCoach2026'])
            ->assertOk()->assertJsonPath('data.role', 'coach');

        $this->assertDatabaseHas('organization_members', ['organization_id' => $org->id, 'role' => 'coach', 'status' => 'active']);
        $this->assertSame(1, TeamStaff::where('team_id', $team->id)->count());

        // Segundo uso: rechazado.
        $this->postJson("/api/public/invitations/{$token}/accept", ['password' => 'ClaveCoach2026'])->assertStatus(410);

        // Puede iniciar sesión.
        $this->withHeaders(['X-App-Platform' => 'web'])->postJson('/api/auth/login', ['email' => 'nuevo.coach@x.test', 'password' => 'ClaveCoach2026'])
            ->assertOk()->assertJsonPath('data.memberships.0.role', 'coach');
    }

    public function test_coach_solo_invita_padres_de_sus_jugadores(): void
    {
        Mail::fake();
        $org = $this->makeOrg();
        $t1 = $this->team($org, 'A');
        $t2 = $this->team($org, 'B');
        $coach = $this->member($org, 'c@x.test', 'coach');
        $this->assign($t1, $coach);
        $mio = $this->player($org, $t1);
        $ajeno = $this->player($org, $t2);

        $this->as($coach)->postJson($this->base.'/invitations', ['email' => 'x@x.test', 'role' => 'coach'])->assertForbidden();
        $this->as($coach)->postJson($this->base.'/invitations', ['email' => 'p@x.test', 'role' => 'guardian', 'player_id' => $ajeno->id])->assertForbidden();
        $r = $this->as($coach)->postJson($this->base.'/invitations', ['email' => 'papa@x.test', 'role' => 'guardian', 'player_id' => $mio->id])->assertCreated();
        $this->assertStringStartsWith('https://ppdguate.com/invitacion?token=', $r->json('data.invite_url'));
    }

    public function test_padre_existente_acepta_con_su_contrasena_y_puede_entrar_sin_membresia(): void
    {
        Mail::fake();
        $org = $this->makeOrg();
        $t = $this->team($org);
        $admin = $this->member($org, 'a@x.test', 'org_admin');
        $hijo = $this->player($org, $t, 'Luis');
        $this->makeUser('papa@x.test');

        $token = $this->tokenFrom($this->as($admin)->postJson($this->base.'/invitations', ['email' => 'papa@x.test', 'role' => 'guardian', 'player_id' => $hijo->id])->json('data.invite_url'));
        $this->app['auth']->forgetGuards();

        $this->getJson("/api/public/invitations/{$token}")->assertJsonPath('data.user_exists', true)->assertJsonPath('data.player_first_name', 'Luis');
        $this->postJson("/api/public/invitations/{$token}/accept", ['password' => 'Equivocada123'])->assertStatus(422)->assertJsonPath('error.code', 'invalid_credentials');
        $this->postJson("/api/public/invitations/{$token}/accept", ['password' => 'ClaveSegura2026', 'relationship' => 'padre'])->assertOk();
        $this->assertSame(1, GuardianPlayer::where('player_id', $hijo->id)->count());
        $this->assertSame(0, OrganizationMember::where('organization_id', $org->id)->where('user_id', '!=', $admin->id)->count());

        $this->withHeaders(['X-App-Platform' => 'ios'])->postJson('/api/auth/login', ['email' => 'papa@x.test', 'password' => 'ClaveSegura2026'])
            ->assertOk()->assertJsonPath('data.is_guardian', true);
    }

    public function test_reinvitar_anula_la_anterior_y_vencida_no_sirve(): void
    {
        Mail::fake();
        $org = $this->makeOrg();
        $admin = $this->member($org, 'a@x.test', 'org_admin');
        \App\Support\Positions::enableSports($org, (array) \App\Models\Sport::where('code', 'soccer')->value('id'));
        $t1 = $this->tokenFrom($this->as($admin)->postJson($this->base.'/invitations', ['email' => 'd@x.test', 'role' => 'director', 'sport_ids' => [\App\Models\Sport::where('code', 'soccer')->value('id')]])->json('data.invite_url'));
        $t2 = $this->tokenFrom($this->as($admin)->postJson($this->base.'/invitations', ['email' => 'd@x.test', 'role' => 'director', 'sport_ids' => [\App\Models\Sport::where('code', 'soccer')->value('id')]])->json('data.invite_url'));
        $this->app['auth']->forgetGuards();

        $this->getJson("/api/public/invitations/{$t1}")->assertNotFound();
        $this->travel(8)->days();
        $this->getJson("/api/public/invitations/{$t2}")->assertJsonPath('data.status', 'expired');
        $this->postJson("/api/public/invitations/{$t2}/accept", ['name' => 'Dir', 'password' => 'ClaveDir2026xx', 'password_confirmation' => 'ClaveDir2026xx'])->assertStatus(410);
    }

    public function test_token_invalido(): void
    {
        $this->getJson('/api/public/invitations/abc')->assertNotFound();
        $this->getJson('/api/public/invitations/'.str_repeat('a', 48))->assertNotFound();
    }
}
