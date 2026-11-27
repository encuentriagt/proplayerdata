<?php

namespace Tests\Feature;

use App\Mail\WelcomeMail;
use App\Models\User;
use Firebase\JWT\JWT;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Mail;
use Tests\Support\BuildsOrgs;
use Tests\TestCase;

/** Crear cuenta e iniciar sesión con Google o Apple (App de padres), con llaves simuladas. */
class SocialLoginTest extends TestCase
{
    use BuildsOrgs, RefreshDatabase;

    private string $private = '';

    protected function setUp(): void
    {
        parent::setUp();
        config(['ppd.social.google_client_ids' => ['web-client.apps.googleusercontent.com'], 'ppd.social.apple_client_ids' => ['com.ppdguate.app']]);
        $key = openssl_pkey_new(['private_key_bits' => 2048, 'private_key_type' => OPENSSL_KEYTYPE_RSA]);
        openssl_pkey_export($key, $this->private);
        $d = openssl_pkey_get_details($key)['rsa'];
        $b64 = fn ($v) => rtrim(strtr(base64_encode($v), '+/', '-_'), '=');
        $jwks = ['keys' => [['kty' => 'RSA', 'alg' => 'RS256', 'use' => 'sig', 'kid' => 'k1', 'n' => $b64($d['n']), 'e' => $b64($d['e'])]]];
        Http::fake(['www.googleapis.com/*' => Http::response($jwks), 'appleid.apple.com/*' => Http::response($jwks)]);
    }

    private function token(string $provider, array $claims = []): string
    {
        $base = $provider === 'google'
            ? ['iss' => 'https://accounts.google.com', 'aud' => 'web-client.apps.googleusercontent.com', 'sub' => 'g-123', 'email' => 'maria@gmail.com', 'email_verified' => true, 'name' => 'María Pérez']
            : ['iss' => 'https://appleid.apple.com', 'aud' => 'com.ppdguate.app', 'sub' => 'a-456', 'email' => 'x1@privaterelay.appleid.com', 'email_verified' => 'true'];

        return JWT::encode(array_merge($base, ['iat' => time(), 'exp' => time() + 600], $claims), $this->private, 'RS256', 'k1');
    }

    private function social(array $body, string $platform = 'android')
    {
        $this->app['auth']->forgetGuards();

        return $this->withHeaders(['X-App-Platform' => $platform])->postJson('/api/app/auth/social', $body);
    }

    public function test_google_crea_cuenta_verificada_con_bienvenida_y_luego_inicia_sesion(): void
    {
        Mail::fake();
        $r = $this->social(['provider' => 'google', 'id_token' => $this->token('google')])->assertCreated()
            ->assertJsonPath('data.created', true)->assertJsonPath('data.must_verify_email', false)
            ->assertJsonPath('data.user.password_set', false)->assertJsonPath('data.user.linked', ['google'])
            ->assertJsonPath('data.user.name', 'María Pérez');
        Mail::assertSent(WelcomeMail::class, fn ($m) => $m->hasTo('maria@gmail.com'));
        $this->assertSame(1, User::guardians()->count());

        // Segunda vez: inicia sesión, sin nueva bienvenida.
        $r = $this->social(['provider' => 'google', 'id_token' => $this->token('google')])->assertOk()->assertJsonPath('data.created', false);

        // La sesión (la más reciente: una por plataforma) sirve en la App; borrar la cuenta sin contraseña pide escribir ELIMINAR.
        $t = $r->json('data.token');
        $this->app['auth']->forgetGuards();
        $this->withToken($t)->getJson('/api/app/children')->assertOk();
        $this->withToken($t)->deleteJson('/api/app/account', ['confirm' => 'no'])->assertStatus(422);
        $this->withToken($t)->deleteJson('/api/app/account', ['confirm' => 'ELIMINAR'])->assertOk();
    }

    public function test_apple_con_nombre_de_la_app_y_sin_correo_despues(): void
    {
        Mail::fake();
        $this->social(['provider' => 'apple', 'id_token' => $this->token('apple', ['nonce' => hash('sha256', 'n1')]), 'nonce' => 'n1', 'name' => 'Luis García'], 'ios')
            ->assertCreated()->assertJsonPath('data.user.name', 'Luis García');
        // Apple ya no manda el correo: se encuentra por sub.
        $this->social(['provider' => 'apple', 'id_token' => $this->token('apple', ['email' => null, 'nonce' => 'n2']), 'nonce' => 'n2'], 'ios')->assertOk();
        // Nonce que no coincide.
        $this->social(['provider' => 'apple', 'id_token' => $this->token('apple', ['nonce' => 'otro']), 'nonce' => 'n3'], 'ios')->assertStatus(422)->assertJsonPath('error.code', 'social_token_invalid');
        // Sin correo y sin cuenta previa.
        $this->social(['provider' => 'apple', 'id_token' => $this->token('apple', ['sub' => 'nuevo', 'email' => null])], 'ios')->assertStatus(422)->assertJsonPath('error.code', 'social_email_required');
    }

    public function test_vincula_cuenta_existente_y_rechaza_tokens_malos(): void
    {
        Mail::fake();
        // Ya registrado con correo (sin verificar) → Google lo vincula y lo deja verificado, sin bienvenida.
        $g = $this->guardian('maria@gmail.com', ['email_verified_at' => null]);
        $this->social(['provider' => 'google', 'id_token' => $this->token('google')])->assertOk()->assertJsonPath('data.created', false)->assertJsonPath('data.must_verify_email', false);
        $this->assertSame('g-123', $g->fresh()->google_sub);
        Mail::assertNothingSent();

        // Otra cuenta de Google con el mismo correo → conflicto.
        $this->social(['provider' => 'google', 'id_token' => $this->token('google', ['sub' => 'g-999'])])->assertStatus(409)->assertJsonPath('error.code', 'social_conflict');

        // Staff con el mismo correo no se toca ni entra.
        $this->member($this->makeOrg(), 'staff@gmail.com', 'coach');
        $this->social(['provider' => 'google', 'id_token' => $this->token('google', ['sub' => 'g-s', 'email' => 'staff@gmail.com'])])->assertCreated();
        $this->assertSame(2, User::where('email', 'staff@gmail.com')->count());

        // Destinatario ajeno, vencido, correo sin verificar, firma de otra llave, plataforma web.
        $this->social(['provider' => 'google', 'id_token' => $this->token('google', ['aud' => 'otra-app'])])->assertStatus(422);
        $this->social(['provider' => 'google', 'id_token' => $this->token('google', ['exp' => time() - 3600])])->assertStatus(422);
        $this->social(['provider' => 'google', 'id_token' => $this->token('google', ['sub' => 'g-new', 'email' => 'nuevo@x.test', 'email_verified' => false])])->assertStatus(422)->assertJsonPath('error.code', 'social_email_required');
        $other = openssl_pkey_new(['private_key_bits' => 2048]);
        openssl_pkey_export($other, $pem);
        $forged = JWT::encode(['iss' => 'https://accounts.google.com', 'aud' => 'web-client.apps.googleusercontent.com', 'sub' => 'g-123', 'exp' => time() + 600], $pem, 'RS256', 'k1');
        $this->social(['provider' => 'google', 'id_token' => $forged])->assertStatus(422);
        $this->social(['provider' => 'google', 'id_token' => $this->token('google')], 'web')->assertStatus(422)->assertJsonPath('error.code', 'platform_invalid');

        // Sin client IDs configurados.
        config(['ppd.social.google_client_ids' => []]);
        $this->social(['provider' => 'google', 'id_token' => $this->token('google')])->assertStatus(503)->assertJsonPath('error.code', 'social_unavailable');
    }
}
