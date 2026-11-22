<?php

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\Organization;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AuthTest extends TestCase
{
    use RefreshDatabase;

    private const PASS = 'ClaveSegura2026';

    private function org(string $slug = 'colegio-demo', string $status = 'active'): Organization
    {
        return Organization::create([
            'name' => 'Colegio Demo', 'slug' => $slug, 'type' => 'school', 'status' => $status,
        ]);
    }

    private function coach(?Organization $org = null, array $attrs = []): User
    {
        $u = new User(['name' => 'Coach', 'email' => 'coach@demo.test', 'password' => self::PASS]);
        $u->forceFill(array_merge(['status' => 'active'], $attrs))->save();
        if ($org) {
            $org->members()->create(['user_id' => $u->id, 'role' => 'coach', 'status' => 'active']);
        }

        return $u;
    }

    private function login(string $email = 'coach@demo.test', string $pass = self::PASS, string $platform = 'web')
    {
        return $this->withHeaders(['X-App-Platform' => $platform])
            ->postJson('/api/auth/login', ['email' => $email, 'password' => $pass]);
    }

    public function test_login_correcto_devuelve_token_y_membresias_con_marca(): void
    {
        $this->coach($this->org());

        $r = $this->login()->assertOk()
            ->assertJsonPath('data.token_type', 'Bearer')
            ->assertJsonPath('data.user.email', 'coach@demo.test')
            ->assertJsonPath('data.memberships.0.role', 'coach')
            ->assertJsonPath('data.memberships.0.organization.slug', 'colegio-demo')
            ->assertJsonMissingPath('data.user.password');

        $this->assertMatchesRegularExpression('/^\d+\|ppd_[A-Za-z0-9]{40,}$/', $r->json('data.token'));
        $this->assertNotNull($r->json('data.expires_at'));
        $this->assertSame(1, AuditLog::where('action', 'auth.login')->count());
    }

    public function test_correo_en_mayusculas_y_espacios(): void
    {
        $this->coach($this->org());
        $this->login('  COACH@Demo.test ')->assertOk();
    }

    public function test_credenciales_incorrectas_mismo_mensaje_exista_o_no(): void
    {
        $this->coach($this->org());
        $a = $this->login('coach@demo.test', 'Incorrecta123')->assertStatus(422)->json('error');
        $b = $this->login('nadie@demo.test', 'Incorrecta123')->assertStatus(422)->json('error');
        $this->assertSame($a, $b);
        $this->assertSame('invalid_credentials', $a['code']);
    }

    public function test_plataforma_obligatoria(): void
    {
        $this->coach($this->org());
        $this->postJson('/api/auth/login', ['email' => 'coach@demo.test', 'password' => self::PASS])
            ->assertStatus(422)->assertJsonPath('error.code', 'platform_invalid');
        $this->login(platform: 'windows')->assertStatus(422);
    }

    public function test_bloqueo_tras_5_intentos_fallidos(): void
    {
        $u = $this->coach($this->org());
        for ($i = 0; $i < 5; $i++) {
            $this->login('coach@demo.test', 'Mala'.$i.'xxxxxx');
        }
        $this->assertNotNull($u->fresh()->locked_until);

        // Aun con la contraseña correcta, sigue bloqueado.
        \Illuminate\Support\Facades\RateLimiter::clear('login');
        $this->app['cache']->flush();
        $this->login()->assertStatus(423)->assertJsonPath('error.code', 'account_locked');
        $this->assertSame(1, AuditLog::where('action', 'auth.locked')->count());

        $this->travel(16)->minutes();
        $this->login()->assertOk();
        $this->assertSame(0, $u->fresh()->failed_logins);
    }

    public function test_limite_de_peticiones_de_login(): void
    {
        $this->coach($this->org());
        for ($i = 0; $i < 5; $i++) {
            $this->login('otro@demo.test', 'Mala123456');
        }
        $this->login('otro@demo.test', 'Mala123456')->assertStatus(429)->assertJsonPath('error.code', 'too_many_requests');
    }

    public function test_usuario_desactivado_no_entra(): void
    {
        $this->coach($this->org(), ['status' => 'disabled']);
        $this->login()->assertStatus(422)->assertJsonPath('error.code', 'invalid_credentials');
    }

    public function test_sin_organizacion_activa_no_entra(): void
    {
        $this->coach($this->org('suspendida', 'suspended'));
        $this->login()->assertStatus(403)->assertJsonPath('error.code', 'no_active_organization');

        User::query()->forceDelete();
        $this->coach(null);
        $this->login()->assertStatus(403);
    }

    public function test_super_admin_entra_sin_organizacion(): void
    {
        $this->coach(null, ['is_super_admin' => true]);
        $this->login()->assertOk()->assertJsonPath('data.user.is_super_admin', true);
    }

    public function test_una_sesion_por_plataforma(): void
    {
        $this->coach($this->org());
        $web1 = $this->login()->json('data.token');
        $android = $this->login(platform: 'android')->json('data.token');
        $web2 = $this->login()->json('data.token');

        $this->app['auth']->forgetGuards();
        $this->withToken($web1)->getJson('/api/auth/me')->assertStatus(401);
        $this->app['auth']->forgetGuards();
        $this->withToken($android)->getJson('/api/auth/me')->assertOk();
        $this->app['auth']->forgetGuards();
        $this->withToken($web2)->getJson('/api/auth/me')->assertOk();
    }

    public function test_me_y_logout(): void
    {
        $this->coach($this->org());
        $t = $this->login()->json('data.token');

        $this->withToken($t)->getJson('/api/auth/me')->assertOk()->assertJsonPath('data.user.email', 'coach@demo.test');
        $this->withToken($t)->postJson('/api/auth/logout')->assertOk();
        $this->app['auth']->forgetGuards();
        $this->withToken($t)->getJson('/api/auth/me')->assertStatus(401)->assertJsonPath('error.code', 'unauthenticated');
    }

    public function test_sin_token_401(): void
    {
        $this->getJson('/api/auth/me')->assertStatus(401)->assertJsonPath('error.code', 'unauthenticated');
    }

    public function test_token_vencido(): void
    {
        $this->coach($this->org());
        $t = $this->login()->json('data.token');
        $this->travel(31)->days();
        $this->withToken($t)->getJson('/api/auth/me')->assertStatus(401);
    }

    public function test_contrasena_temporal_obliga_a_cambiar(): void
    {
        $this->coach($this->org(), ['must_change_password' => true]);
        $t = $this->login()->assertOk()->assertJsonPath('data.user.must_change_password', true)->json('data.token');

        // Puede ver /me pero nada más (se probará con rutas de PC cuando existan).
        $this->withToken($t)->getJson('/api/auth/me')->assertOk();

        $this->withToken($t)->postJson('/api/auth/password', [
            'current_password' => self::PASS, 'password' => 'corta', 'password_confirmation' => 'corta',
        ])->assertStatus(422)->assertJsonPath('error.code', 'validation_failed');

        $this->withToken($t)->postJson('/api/auth/password', [
            'current_password' => 'Equivocada99', 'password' => 'NuevaClave2026', 'password_confirmation' => 'NuevaClave2026',
        ])->assertStatus(422);

        $this->withToken($t)->postJson('/api/auth/password', [
            'current_password' => self::PASS, 'password' => 'NuevaClave2026', 'password_confirmation' => 'NuevaClave2026',
        ])->assertOk()->assertJsonPath('data.user.must_change_password', false);

        $this->app['auth']->forgetGuards();
        $this->login(pass: 'NuevaClave2026')->assertOk();
        $this->assertSame(1, AuditLog::where('action', 'auth.password_changed')->count());
    }

    public function test_cambio_de_contrasena_cierra_otras_sesiones(): void
    {
        $this->coach($this->org());
        $web = $this->login()->json('data.token');
        $android = $this->login(platform: 'android')->json('data.token');

        $this->withToken($web)->postJson('/api/auth/password', [
            'current_password' => self::PASS, 'password' => 'NuevaClave2026', 'password_confirmation' => 'NuevaClave2026',
        ])->assertOk();

        $this->app['auth']->forgetGuards();
        $this->withToken($android)->getJson('/api/auth/me')->assertStatus(401);
        $this->app['auth']->forgetGuards();
        $this->withToken($web)->getJson('/api/auth/me')->assertOk();
    }

    public function test_usuario_desactivado_pierde_la_sesion(): void
    {
        $u = $this->coach($this->org());
        $t = $this->login()->json('data.token');
        $u->forceFill(['status' => 'disabled'])->save();
        $this->withToken($t)->getJson('/api/auth/me')->assertStatus(401);
        $this->assertSame(0, $u->tokens()->count());
    }
}
