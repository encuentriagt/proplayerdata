<?php

namespace Tests\Feature;

use App\Models\Organization;
use App\Models\PlanGrant;
use App\Models\User;
use App\Support\Totp;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Storage;
use Tests\Support\BuildsOrgs;
use Tests\TestCase;

class AdminTest extends TestCase
{
    use BuildsOrgs, RefreshDatabase;

    private function login(string $email): string
    {
        $this->app['auth']->forgetGuards();

        return $this->withHeaders(['X-App-Platform' => 'web'])->postJson('/api/auth/login', ['email' => $email, 'password' => 'ClaveSegura2026'])
            ->assertOk()->json('data.token');
    }

    private function adminToken(): string
    {
        $this->makeUser('dueno@ppd.test', ['is_super_admin' => true]);
        $t = $this->login('dueno@ppd.test');
        $secret = $this->withToken($t)->postJson('/api/auth/totp/setup')->assertOk()->json('data.secret');
        $this->withToken($t)->postJson('/api/auth/totp/confirm', ['code' => Totp::code($secret, intdiv(time(), 30))])->assertOk();

        return $t;
    }

    public function test_totp_es_obligatorio_para_el_panel(): void
    {
        $this->makeUser('dueno@ppd.test', ['is_super_admin' => true]);
        $r = $this->withHeaders(['X-App-Platform' => 'web'])->postJson('/api/auth/login', ['email' => 'dueno@ppd.test', 'password' => 'ClaveSegura2026'])
            ->assertJsonPath('data.admin_totp', 'setup');
        $t = $r->json('data.token');

        $this->withToken($t)->getJson('/api/admin/organizations')->assertForbidden()->assertJsonPath('error.code', 'totp_setup_required');

        $setup = $this->withToken($t)->postJson('/api/auth/totp/setup')->assertOk();
        $this->assertStringStartsWith('otpauth://totp/ppd%3Adueno%40ppd.test', $setup->json('data.otpauth_uri'));
        $secret = $setup->json('data.secret');
        $this->withToken($t)->postJson('/api/auth/totp/confirm', ['code' => '000000'])->assertStatus(422);
        $code = Totp::code($secret, intdiv(time(), 30));
        $this->withToken($t)->postJson('/api/auth/totp/confirm', ['code' => $code])->assertOk();
        $this->withToken($t)->getJson('/api/admin/organizations')->assertOk();

        // No se puede volver a generar el secreto.
        $this->withToken($t)->postJson('/api/auth/totp/setup')->assertStatus(409);

        // Nueva sesión: pide código; el mismo código no se puede reutilizar.
        $t2 = $this->login('dueno@ppd.test');
        $this->withToken($t2)->getJson('/api/admin/organizations')->assertForbidden()->assertJsonPath('error.code', 'totp_required');
        $this->withToken($t2)->postJson('/api/auth/totp/verify', ['code' => $code])->assertStatus(422);
        $next = Totp::code($secret, intdiv(time(), 30) + 1);
        $this->withToken($t2)->postJson('/api/auth/totp/verify', ['code' => $next])->assertOk();
        $this->withToken($t2)->getJson('/api/admin/organizations')->assertOk();

        // 30 minutos sin uso: vence.
        $this->travel(31)->minutes();
        $this->withToken($t2)->getJson('/api/admin/organizations')->assertForbidden();
    }

    public function test_usuario_normal_no_entra_al_panel(): void
    {
        $org = $this->makeOrg();
        $this->member($org, 'a@x.test', 'org_admin');
        $t = $this->login('a@x.test');
        $this->withToken($t)->getJson('/api/admin/organizations')->assertForbidden();
        $this->withToken($t)->postJson('/api/auth/totp/setup')->assertForbidden();
    }

    public function test_crear_organizacion_con_invitacion_marca_y_suspender(): void
    {
        Mail::fake();
        Storage::fake('public');
        $t = $this->adminToken();

        $r = $this->withToken($t)->postJson('/api/admin/organizations', [
            'name' => 'Colegio Americano', 'slug' => 'colegio-americano', 'type' => 'school',
            'color_primary' => '#0A3D91', 'quota_pro' => 20, 'quota_premium' => 10, 'admin_email' => 'director@ca.test',
        ])->assertCreated()->assertJsonPath('data.slug', 'colegio-americano')->assertJsonPath('data.plan_usage.premium.quota', 10);
        $this->assertStringStartsWith('https://pc.ppdguate.com/colegio-americano/invitacion?token=', $r->json('meta.admin_invite_url'));
        $id = $r->json('data.id');

        $this->withToken($t)->postJson('/api/admin/organizations', ['name' => 'Otro', 'slug' => 'colegio-americano', 'type' => 'team'])->assertStatus(422);

        $this->withToken($t)->postJson("/api/admin/organizations/{$id}/branding/logo", ['image' => UploadedFile::fake()->create('x.svg', 5, 'image/svg+xml')])->assertStatus(422);
        $url = $this->withToken($t)->postJson("/api/admin/organizations/{$id}/branding/logo", ['image' => UploadedFile::fake()->image('logo.png', 300, 300)])
            ->assertOk()->json('data.url');
        $this->assertStringContainsString('/storage/orgs/'.$id.'/logo-', $url);
        $this->getJson('/api/public/orgs/colegio-americano/branding')->assertJsonPath('data.logo_url', $url);

        $this->withToken($t)->patchJson("/api/admin/organizations/{$id}", ['status' => 'suspended'])->assertOk()->assertJsonPath('data.status', 'suspended');
        $this->assertSame('suspended', Organization::find($id)->status->value);
    }

    public function test_catalogo_de_deportes_editable(): void
    {
        $t = $this->adminToken();
        $id = $this->withToken($t)->postJson('/api/admin/sports', ['code' => 'rugby', 'name' => 'Rugby', 'periods' => 2, 'period_minutes' => 40])->assertCreated()->json('data.id');
        $this->withToken($t)->postJson("/api/admin/sports/{$id}/positions", ['code' => 'PIL', 'name' => 'Pilar'])->assertCreated();
        $this->withToken($t)->postJson("/api/admin/sports/{$id}/stat-types", ['code' => 'try', 'name' => 'Try', 'scores' => 5])->assertCreated();
        $this->withToken($t)->postJson("/api/admin/sports/{$id}/stat-types", ['code' => 'try', 'name' => 'Try'])->assertStatus(422);
        $this->withToken($t)->patchJson("/api/admin/sports/{$id}", ['active' => false])->assertOk()->assertJsonPath('data.active', false);
        $this->app['auth']->forgetGuards();
        $this->withToken($t)->getJson('/api/catalog/sports')->assertOk();
        $this->assertNotContains('rugby', collect($this->withToken($t)->getJson('/api/catalog/sports')->json('data'))->pluck('code')->all());
    }

    public function test_planes_por_super_admin(): void
    {
        $t = $this->adminToken();
        $this->makeUser('papa@x.test');
        $this->withToken($t)->postJson('/api/admin/plans', ['email' => 'papa@x.test', 'plan' => 'premium', 'note' => 'cortesía'])->assertCreated();
        $this->withToken($t)->postJson('/api/admin/plans', ['email' => 'nadie@x.test', 'plan' => 'pro'])->assertStatus(422);
        $this->assertSame(1, PlanGrant::active()->count());
        $id = PlanGrant::first()->id;
        $this->withToken($t)->deleteJson("/api/admin/plans/{$id}")->assertOk();
        $this->assertSame(0, PlanGrant::active()->count());
        $this->withToken($t)->getJson('/api/admin/audit?action=plan.')->assertOk()->assertJsonCount(2, 'data');
    }

    public function test_marca_editable_por_la_organizacion_solo_si_se_permite(): void
    {
        $org = $this->makeOrg();
        $admin = $this->member($org, 'a@x.test', 'org_admin');
        $this->as($admin)->patchJson('/api/pc/orgs/colegio-demo/branding', ['color_primary' => '#123456'])->assertForbidden()->assertJsonPath('error.code', 'branding_locked');
        $org->update(['branding_editable_by_org' => true]);
        $this->as($admin)->patchJson('/api/pc/orgs/colegio-demo/branding', ['color_primary' => '#123456'])->assertOk()->assertJsonPath('data.colors.primary', '#123456');
    }
}
