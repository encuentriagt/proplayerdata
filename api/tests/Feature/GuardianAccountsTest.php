<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Tests\Support\BuildsOrgs;
use Tests\TestCase;

/** Cuentas de padre separadas del staff, registro en la App, verificación del correo y contraseña con código. */
class GuardianAccountsTest extends TestCase
{
    use BuildsOrgs, RefreshDatabase;

    private const PASS = 'ClaveSegura2026';

    private function app_(string $method, string $uri, array $body = [], ?string $token = null)
    {
        $this->app['auth']->forgetGuards();
        $h = ['X-App-Platform' => 'android'];
        if ($token) {
            $h['Authorization'] = 'Bearer '.$token;
        }

        return $this->withHeaders($h)->json($method, $uri, $body);
    }

    private function code(User $u, string $purpose): string
    {
        return app("test.email_code.{$u->id}.{$purpose}");
    }

    public function test_registro_verificacion_y_bloqueo_hasta_verificar(): void
    {
        Mail::fake();
        $body = ['name' => 'María Pérez', 'email' => 'Maria@X.test', 'phone' => '+502 5555 1234', 'password' => self::PASS, 'password_confirmation' => self::PASS];
        $r = $this->app_('POST', '/api/app/auth/register', $body)->assertCreated()
            ->assertJsonPath('data.must_verify_email', true)->assertJsonPath('data.is_guardian', true)
            ->assertJsonPath('data.user.account_type', 'guardian')->assertJsonPath('data.memberships', []);
        $t = $r->json('data.token');
        $u = User::where('email', 'maria@x.test')->sole();

        // Sin verificar: solo verificar, reenviar, me y salir.
        $this->app_('GET', '/api/app/children', [], $t)->assertStatus(403)->assertJsonPath('error.code', 'email_unverified');
        $this->app_('GET', '/api/me/notifications', [], $t)->assertStatus(403);
        $this->app_('GET', '/api/auth/me', [], $t)->assertOk()->assertJsonPath('data.must_verify_email', true);

        $this->app_('POST', '/api/app/auth/verify-email', ['code' => '000000'], $t)->assertStatus(422)->assertJsonPath('error.code', 'code_invalid');
        $this->app_('POST', '/api/app/auth/verify-email/resend', [], $t)->assertOk();
        $this->app_('POST', '/api/app/auth/verify-email/resend', [], $t)->assertStatus(429);
        $this->app_('POST', '/api/app/auth/verify-email', ['code' => $this->code($u, 'verify')], $t)->assertOk()->assertJsonPath('data.email_verified', true);
        $this->app_('GET', '/api/app/children', [], $t)->assertOk()->assertExactJson(['data' => []]);

        // El mismo correo como padre otra vez: email_taken.
        $this->app_('POST', '/api/app/auth/register', $body)->assertStatus(422)->assertJsonPath('error.code', 'email_taken');
        // Registro solo desde la App.
        $this->app['auth']->forgetGuards();
        $this->withHeaders(['X-App-Platform' => 'web'])->postJson('/api/app/auth/register', ['email' => 'otro@x.test'] + $body)->assertStatus(422)->assertJsonPath('error.code', 'platform_invalid');
    }

    public function test_cuentas_separadas_con_el_mismo_correo(): void
    {
        $org = $this->makeOrg();
        $coach = $this->member($org, 'ana@x.test', 'coach');
        // Staff no entra a la App: mismo mensaje que credenciales malas.
        $this->app_('POST', '/api/auth/login', ['email' => 'ana@x.test', 'password' => self::PASS])->assertStatus(422)->assertJsonPath('error.code', 'invalid_credentials');

        // Se registra como padre con el mismo correo y otra contraseña.
        $this->app_('POST', '/api/app/auth/register', ['name' => 'Ana', 'email' => 'ana@x.test', 'password' => 'OtraClave2026', 'password_confirmation' => 'OtraClave2026'])->assertCreated();
        $this->assertSame(2, User::where('email', 'ana@x.test')->count());
        $g = User::guardians()->where('email', 'ana@x.test')->sole();
        $g->forceFill(['email_verified_at' => now()])->save();

        $this->app_('POST', '/api/auth/login', ['email' => 'ana@x.test', 'password' => self::PASS])->assertStatus(422);
        $gt = $this->app_('POST', '/api/auth/login', ['email' => 'ana@x.test', 'password' => 'OtraClave2026'])->assertOk()->json('data.token');
        // El padre no entra a la PC (web) ni a sus rutas.
        $this->app['auth']->forgetGuards();
        $this->withHeaders(['X-App-Platform' => 'web'])->postJson('/api/auth/login', ['email' => 'ana@x.test', 'password' => 'OtraClave2026'])->assertStatus(422);
        $this->app_('GET', '/api/pc/orgs/colegio-demo/access', [], $gt)->assertForbidden();
        $this->app_('GET', '/api/admin/organizations', [], $gt)->assertForbidden();
        // El staff no usa la App.
        $this->as($coach)->getJson('/api/app/children')->assertForbidden();
        $this->as($coach)->getJson('/api/pc/orgs/colegio-demo/access')->assertOk();
    }

    public function test_contrasena_olvidada_con_codigo(): void
    {
        Mail::fake();
        $g = $this->guardian('papa@x.test');
        $this->member($this->makeOrg(), 'papa@x.test', 'coach'); // mismo correo como staff: no se toca
        $staff = User::staff()->where('email', 'papa@x.test')->sole();

        $this->app_('POST', '/api/app/auth/password/forgot', ['email' => 'nadie@x.test'])->assertOk();
        $this->app_('POST', '/api/app/auth/password/forgot', ['email' => 'papa@x.test'])->assertOk();
        $code = $this->code($g, 'reset');
        $this->app_('POST', '/api/app/auth/password/reset', ['email' => 'papa@x.test', 'code' => '123456', 'password' => 'NuevaClave2026', 'password_confirmation' => 'NuevaClave2026'])
            ->assertStatus(422)->assertJsonPath('error.code', 'code_invalid');
        $this->app_('POST', '/api/app/auth/password/reset', ['email' => 'papa@x.test', 'code' => $code, 'password' => 'NuevaClave2026', 'password_confirmation' => 'NuevaClave2026'])->assertOk();
        // El código ya no sirve otra vez.
        $this->app_('POST', '/api/app/auth/password/reset', ['email' => 'papa@x.test', 'code' => $code, 'password' => 'OtraMas2026x', 'password_confirmation' => 'OtraMas2026x'])->assertStatus(422);

        $this->app_('POST', '/api/auth/login', ['email' => 'papa@x.test', 'password' => 'NuevaClave2026'])->assertOk();
        $this->assertTrue(\Illuminate\Support\Facades\Hash::check(self::PASS, $staff->fresh()->password));
    }

    public function test_codigo_se_bloquea_tras_cinco_intentos(): void
    {
        Mail::fake();
        $g = $this->guardian('papa@x.test');
        $this->app_('POST', '/api/app/auth/password/forgot', ['email' => 'papa@x.test'])->assertOk();
        $code = $this->code($g, 'reset');
        $wrong = $code === '111111' ? '222222' : '111111';
        for ($i = 0; $i < 5; $i++) {
            app(\App\Services\EmailCodeService::class)->consume($g, 'reset', $wrong);
        }
        $this->assertFalse(app(\App\Services\EmailCodeService::class)->consume($g, 'reset', $code));
    }
}
