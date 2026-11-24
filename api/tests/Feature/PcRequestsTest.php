<?php

namespace Tests\Feature;

use App\Mail\PasswordResetMail;
use App\Models\Event;
use App\Models\GuardianPlayer;
use App\Models\UserNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Tests\Support\BuildsOrgs;
use Tests\TestCase;

/** Pedidos del agente de la PC (2026-11-22). */
class PcRequestsTest extends TestCase
{
    use BuildsOrgs, RefreshDatabase;

    private string $base = '/api/pc/orgs/colegio-demo';

    private function tokenFrom(string $url): string
    {
        parse_str(parse_url($url, PHP_URL_QUERY), $q);

        return $q['token'];
    }

    public function test_branding_editable_en_membresias(): void
    {
        $org = $this->makeOrg();
        $this->member($org, 'a@x.test', 'org_admin');
        $login = fn () => $this->withHeaders(['X-App-Platform' => 'web'])->postJson('/api/auth/login', ['email' => 'a@x.test', 'password' => 'ClaveSegura2026']);
        $login()->assertJsonPath('data.memberships.0.branding_editable', false);
        $org->update(['branding_editable_by_org' => true]);
        $login()->assertJsonPath('data.memberships.0.branding_editable', true);
    }

    public function test_recuperar_contrasena_por_correo(): void
    {
        Mail::fake();
        $org = $this->makeOrg();
        $u = $this->member($org, 'c@x.test', 'coach');

        $this->postJson('/api/auth/password/forgot', ['email' => 'nadie@x.test'])->assertOk();
        Mail::assertNothingSent();

        $msg = $this->postJson('/api/auth/password/forgot', ['email' => 'C@X.test', 'slug' => 'colegio-demo'])->assertOk()->json('data.message');
        $this->assertStringContainsString('Si el correo está registrado', $msg);
        $this->app->terminate();

        $url = null;
        Mail::assertSent(PasswordResetMail::class, function ($m) use (&$url) {
            $url = $m->url;

            return $m->hasTo('c@x.test');
        });
        $this->assertStringStartsWith('https://pc.ppdguate.com/colegio-demo/restablecer?token=', $url);
        $token = $this->tokenFrom($url);

        $this->getJson("/api/auth/password/reset/{$token}")->assertOk()->assertJsonPath('data.email_masked', 'c*@x.test');
        $this->postJson('/api/auth/password/reset', ['token' => $token, 'password' => 'NuevaClave2026', 'password_confirmation' => 'NuevaClave2026'])->assertOk();
        $this->postJson('/api/auth/password/reset', ['token' => $token, 'password' => 'OtraClave2026', 'password_confirmation' => 'OtraClave2026'])->assertStatus(410);
        $this->withHeaders(['X-App-Platform' => 'web'])->postJson('/api/auth/login', ['email' => 'c@x.test', 'password' => 'NuevaClave2026'])->assertOk();
    }

    public function test_enlace_de_restablecimiento_vence(): void
    {
        Mail::fake();
        $org = $this->makeOrg();
        $this->member($org, 'c@x.test', 'coach');
        $this->postJson('/api/auth/password/forgot', ['email' => 'c@x.test'])->assertOk();
        $this->app->terminate();
        $url = null;
        Mail::assertSent(PasswordResetMail::class, function ($m) use (&$url) {
            $url = $m->url;

            return true;
        });
        $this->travel(61)->minutes();
        $this->getJson('/api/auth/password/reset/'.$this->tokenFrom($url))->assertStatus(410);
    }

    public function test_admin_genera_enlace_para_un_miembro(): void
    {
        $org = $this->makeOrg();
        $admin = $this->member($org, 'a@x.test', 'org_admin');
        $coach = $this->member($org, 'c@x.test', 'coach');
        $members = $this->as($admin)->getJson($this->base.'/members')->json('data');
        $coachMember = collect($members)->firstWhere('user_id', $coach->id)['id'];
        $adminMember = collect($members)->firstWhere('user_id', $admin->id)['id'];

        $url = $this->as($admin)->postJson($this->base."/members/{$coachMember}/reset-password")->assertOk()->json('data.reset_url');
        $this->assertStringStartsWith('https://pc.ppdguate.com/colegio-demo/restablecer?token=', $url);
        $this->as($admin)->postJson($this->base."/members/{$adminMember}/reset-password")->assertStatus(422);
        $this->as($coach)->postJson($this->base."/members/{$adminMember}/reset-password")->assertForbidden();

        $this->app['auth']->forgetGuards();
        $this->travel(23)->hours();
        $this->postJson('/api/auth/password/reset', ['token' => $this->tokenFrom($url), 'password' => 'NuevaClave2026', 'password_confirmation' => 'NuevaClave2026'])->assertOk();
    }

    public function test_reenviar_invitacion_rota_el_token(): void
    {
        Mail::fake();
        $org = $this->makeOrg();
        $admin = $this->member($org, 'a@x.test', 'org_admin');
        $org->sports()->attach(\App\Models\Sport::where('code', 'soccer')->value('id'));
        $r = $this->as($admin)->postJson($this->base.'/invitations', ['email' => 'd@x.test', 'role' => 'director', 'sport_ids' => [\App\Models\Sport::where('code', 'soccer')->value('id')]])->json('data');
        $old = $this->tokenFrom($r['invite_url']);
        $new = $this->tokenFrom($this->as($admin)->postJson($this->base."/invitations/{$r['id']}/resend")->assertOk()->json('data.invite_url'));
        $this->assertNotSame($old, $new);
        $this->app['auth']->forgetGuards();
        $this->getJson("/api/public/invitations/{$old}")->assertNotFound();
        $this->getJson("/api/public/invitations/{$new}")->assertOk()->assertJsonPath('data.status', 'pending');
    }

    public function test_evento_trae_catalogo_y_filtro_fichas_pendientes(): void
    {
        $org = $this->makeOrg();
        $team = $this->team($org, 'Sub-12', 'basketball');
        $admin = $this->member($org, 'a@x.test', 'org_admin');
        $mk = fn ($days, $published = false, $status = 'scheduled') => Event::create([
            'organization_id' => $org->id, 'team_id' => $team->id, 'type' => 'match', 'status' => $status,
            'starts_at' => now()->addDays($days), 'result_published_at' => $published ? now() : null,
        ]);
        $pendiente = $mk(-3);
        $mk(-5, true, 'finished');
        $mk(-2, false, 'cancelled');
        $mk(4);

        $this->as($admin)->getJson($this->base."/events/{$pendiente->id}")->assertOk()
            ->assertJsonPath('data.sport.code', 'basketball')->assertJsonPath('data.sport.stat_types.2.code', 'point_3');
        $this->as($admin)->getJson($this->base.'/events?pending_sheet=1')->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.id', $pendiente->id);
    }

    public function test_corregir_ficha_publicada_con_publish_false_igual_avisa_si_cambia_el_marcador(): void
    {
        $org = $this->makeOrg();
        $team = $this->team($org);
        $admin = $this->member($org, 'a@x.test', 'org_admin');
        $p = $this->player($org, $team);
        $papa = $this->makeUser('papa@x.test');
        GuardianPlayer::create(['user_id' => $papa->id, 'player_id' => $p->id]);
        $e = Event::create(['organization_id' => $org->id, 'team_id' => $team->id, 'type' => 'match', 'status' => 'scheduled', 'starts_at' => now()->subHour()]);

        $sheet = ['score_us' => 1, 'score_them' => 0, 'lineup' => [], 'actions' => []];
        $this->as($admin)->putJson($this->base."/events/{$e->id}/match-sheet", $sheet + ['publish' => true])->assertOk();
        $this->as($admin)->putJson($this->base."/events/{$e->id}/match-sheet", ['score_us' => 2] + $sheet + ['publish' => false])
            ->assertOk()->assertJsonPath('data.status', 'finished');
        $this->assertSame(2, UserNotification::where('kind', 'match_result')->count());
    }
}
