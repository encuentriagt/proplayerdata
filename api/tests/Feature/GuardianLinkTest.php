<?php

namespace Tests\Feature;

use App\Models\GuardianPlayer;
use App\Models\Invitation;
use App\Models\UserNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Tests\Support\BuildsOrgs;
use Tests\TestCase;

/** Vínculo padre-hijo desde la App: invitaciones del correo, código corto, rechazo y desvincular. */
class GuardianLinkTest extends TestCase
{
    use BuildsOrgs, RefreshDatabase;

    private string $base = '/api/pc/orgs/colegio-demo';

    private function invite($admin, string $email, int $playerId)
    {
        $this->app['auth']->forgetGuards();

        return $this->as($admin)->postJson($this->base.'/invitations', ['email' => $email, 'role' => 'guardian', 'player_id' => $playerId])->assertCreated();
    }

    public function test_padre_ve_la_invitacion_la_acepta_y_aparece_el_hijo(): void
    {
        Mail::fake();
        $org = $this->makeOrg();
        $f = $this->team($org, 'Sub-12', 'soccer');
        $b = $this->team($org, 'Básquet', 'basketball');
        $admin = $this->member($org, 'a@x.test', 'org_admin');
        $ana = $this->player($org, $f, 'Ana');
        \App\Models\TeamPlayer::create(['team_id' => $b->id, 'player_id' => $ana->id, 'active' => true]);

        $this->invite($admin, 'Papa@X.test', $ana->id);
        $inv = Invitation::where('role', 'guardian')->sole();
        $this->assertMatchesRegularExpression('/^[A-Z2-9]{4}-[A-Z2-9]{4}$/', $inv->code);
        Mail::assertSent(\App\Mail\InvitationMail::class, fn ($m) => str_contains($m->render(), $inv->code) && str_contains($m->render(), 'Ana'));

        // El padre se registra después con ese mismo correo.
        $papa = $this->guardian('papa@x.test');
        $this->app['auth']->forgetGuards();
        $r = $this->as($papa)->getJson('/api/app/invitations')->assertOk()->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.player.first_name', 'Ana')->assertJsonPath('data.0.organization.name', $org->name);
        $this->assertEqualsCanonicalizing(['soccer', 'basketball'], collect($r->json('data.0.teams'))->pluck('sport.code')->all());
        $this->assertArrayNotHasKey('code', $r->json('data.0'));

        $this->as($papa)->getJson('/api/app/children')->assertExactJson(['data' => []]);
        $this->as($papa)->postJson("/api/app/invitations/{$inv->id}/accept")->assertOk()->assertJsonPath('data.child_id', $ana->id);
        // Repetir no duplica.
        $this->as($papa)->postJson("/api/app/invitations/{$inv->id}/accept")->assertOk();
        $this->assertSame(1, GuardianPlayer::where('user_id', $papa->id)->count());

        $c = $this->as($papa)->getJson('/api/app/children')->assertOk()->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.first_name', 'Ana')->assertJsonPath('data.0.organization.id', $org->id);
        $this->assertCount(2, $c->json('data.0.teams'));
        $this->assertNotNull($c->json('data.0.teams.0.sport.id'));
        $this->as($papa)->getJson('/api/app/invitations')->assertJsonCount(0, 'data');

        // Desvincular.
        $this->as($papa)->deleteJson("/api/app/children/{$ana->id}")->assertOk();
        $this->as($papa)->getJson('/api/app/children')->assertJsonCount(0, 'data');
    }

    public function test_codigo_de_otro_correo_rechazo_y_aviso_si_ya_tiene_cuenta(): void
    {
        Mail::fake();
        $org = $this->makeOrg();
        $t = $this->team($org);
        $admin = $this->member($org, 'a@x.test', 'org_admin');
        $luis = $this->player($org, $t, 'Luis');
        $sofi = $this->player($org, $t, 'Sofía');

        // Ya tiene cuenta verificada: recibe aviso link_invitation.
        $mama = $this->guardian('mama@x.test');
        $this->invite($admin, 'mama@x.test', $sofi->id);
        $this->assertSame('link_invitation', UserNotification::where('user_id', $mama->id)->value('kind'));

        // Invitación a otro correo: se acepta con el código, escrito como sea.
        $this->invite($admin, 'trabajo@x.test', $luis->id);
        $code = Invitation::where('email', 'trabajo@x.test')->value('code');
        $this->app['auth']->forgetGuards();
        $this->as($mama)->postJson('/api/app/invitations/redeem', ['code' => 'XXXX-0000'])->assertStatus(422)->assertJsonPath('error.code', 'code_invalid');
        $this->as($mama)->postJson('/api/app/invitations/redeem', ['code' => strtolower(str_replace('-', ' ', $code))])->assertOk()->assertJsonPath('data.child_id', $luis->id);
        // Otra cuenta no puede usar el mismo código.
        $otro = $this->guardian('otro@x.test');
        $this->app['auth']->forgetGuards();
        $this->as($otro)->postJson('/api/app/invitations/redeem', ['code' => $code])->assertStatus(409)->assertJsonPath('error.code', 'invitation_used');
        // No puede aceptar por id una invitación que no es de su correo.
        $sofiInv = Invitation::where('email', 'mama@x.test')->value('id');
        $this->as($otro)->postJson("/api/app/invitations/{$sofiInv}/accept")->assertNotFound();

        // Rechazar.
        $this->app['auth']->forgetGuards();
        $this->as($mama)->postJson("/api/app/invitations/{$sofiInv}/decline")->assertOk();
        $this->as($mama)->postJson("/api/app/invitations/{$sofiInv}/accept")->assertStatus(410)->assertJsonPath('error.code', 'invitation_closed');
        $this->assertSame(['Luis'], collect($this->as($mama)->getJson('/api/app/children')->json('data'))->pluck('first_name')->all());
    }

    public function test_enlace_del_correo_vincula_sin_contrasena_con_cualquier_cuenta(): void
    {
        Mail::fake();
        $org = $this->makeOrg();
        $t = $this->team($org);
        $admin = $this->member($org, 'a@x.test', 'org_admin');
        $ana = $this->player($org, $t, 'Ana');
        $url = $this->invite($admin, 'papa@colegio.test', $ana->id)->json('data.invite_url');
        $token = substr($url, strpos($url, 'token=') + 6);

        // La vista previa pública trae el código (para "Tengo un código") y no pide nada más.
        $this->getJson('/api/public/invitations/'.$token)->assertOk()->assertJsonPath('data.status', 'pending')
            ->assertJsonPath('data.code', Invitation::where('player_id', $ana->id)->value('code'));

        // Padre que entró con Google, con OTRO correo y sin contraseña: la App manda el token del enlace.
        $g = $this->guardian('papa@gmail.com', ['password_set' => false]);
        $this->app['auth']->forgetGuards();
        $this->as($g)->postJson('/api/app/invitations/accept-token', ['token' => str_repeat('a', 48)])->assertNotFound();
        $this->as($g)->postJson('/api/app/invitations/accept-token', ['token' => $token])->assertOk()
            ->assertJsonPath('data.child_id', $ana->id)->assertJsonPath('data.child_first_name', 'Ana')->assertJsonPath('data.organization_name', $org->name);
        $this->as($g)->postJson('/api/app/invitations/accept-token', ['token' => $token])->assertOk(); // repetir: igual
        $this->as($g)->getJson('/api/app/children')->assertJsonPath('data.0.first_name', 'Ana');
        $this->getJson('/api/public/invitations/'.$token)->assertJsonPath('data.status', 'accepted')->assertJsonPath('data.code', null);

        // Otra cuenta ya no puede usar ese enlace.
        $otro = $this->guardian('otro@x.test');
        $this->app['auth']->forgetGuards();
        $this->as($otro)->postJson('/api/app/invitations/accept-token', ['token' => $token])->assertStatus(409)->assertJsonPath('error.code', 'invitation_used');
    }
}
