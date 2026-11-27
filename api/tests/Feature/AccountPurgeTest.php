<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Support\BuildsOrgs;
use Tests\TestCase;

class AccountPurgeTest extends TestCase
{
    use BuildsOrgs, RefreshDatabase;

    public function test_vista_previa_y_borrado_completo_solo_del_tipo_indicado(): void
    {
        $org = $this->makeOrg();
        $team = $this->team($org);
        $g = $this->guardian('papa@x.test', ['email_verified_at' => null]);
        \App\Models\GuardianPlayer::create(['user_id' => $g->id, 'player_id' => $this->player($org, $team)->id]);
        $g->createToken('platform:android');
        $staff = $this->member($org, 'papa@x.test', 'coach');

        $this->artisan('ppd:account-purge', ['email' => 'PAPA@x.test'])->expectsOutputToContain('Vista previa')->assertSuccessful();
        $this->assertNotNull(User::find($g->id));

        $this->artisan('ppd:account-purge', ['email' => 'papa@x.test', '--force' => true])->assertSuccessful();
        $this->assertNull(User::withTrashed()->find($g->id));
        $this->assertSame(0, \App\Models\GuardianPlayer::count());
        $this->assertSame(0, \Illuminate\Support\Facades\DB::table('personal_access_tokens')->where('tokenable_id', $g->id)->count());
        $this->assertNotNull(User::find($staff->id)); // la cuenta de staff con el mismo correo no se toca

        // El correo se puede registrar otra vez.
        $this->withHeaders(['X-App-Platform' => 'android'])->postJson('/api/app/auth/register', ['name' => 'Papá', 'email' => 'papa@x.test', 'password' => 'ClaveSegura2026', 'password_confirmation' => 'ClaveSegura2026'])->assertCreated();

        // Admin activo: no se borra.
        $this->member($org, 'admin@x.test', 'org_admin');
        $this->artisan('ppd:account-purge', ['email' => 'admin@x.test', '--type' => 'staff', '--force' => true])->assertFailed();
    }
}
