<?php

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\Player;
use App\Models\Sport;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\Support\BuildsOrgs;
use Tests\TestCase;

class PcTeamsPlayersTest extends TestCase
{
    use BuildsOrgs, RefreshDatabase;

    private string $base = '/api/pc/orgs/colegio-demo';

    public function test_catalogo_de_deportes(): void
    {
        $org = $this->makeOrg();
        $this->as($this->member($org, 'c@x.test', 'coach'));
        $r = $this->getJson('/api/catalog/sports')->assertOk();
        $codes = collect($r->json('data'))->pluck('code')->all();
        $this->assertContains('futbol', $codes);
        $this->assertContains('basquetbol', $codes);
        $basket = collect($r->json('data'))->firstWhere('code', 'basquetbol');
        $this->assertSame(3, collect($basket['stat_types'])->firstWhere('code', 'point_3')['scores']);
    }

    public function test_no_miembro_no_ve_la_organizacion(): void
    {
        $this->makeOrg();
        $this->as($this->makeUser('extra@x.test'));
        $this->getJson($this->base.'/teams')->assertNotFound();
    }

    public function test_organizacion_suspendida(): void
    {
        $org = $this->makeOrg('colegio-demo', 'suspended');
        $this->as($this->member($org, 'a@x.test', 'org_admin'));
        $this->getJson($this->base.'/teams')->assertStatus(403)->assertJsonPath('error.code', 'organization_suspended');
    }

    public function test_coach_solo_ve_sus_equipos_director_y_admin_ven_todos(): void
    {
        $org = $this->makeOrg();
        $t1 = $this->team($org, 'Sub-12');
        $t2 = $this->team($org, 'Sub-15');
        $coach = $this->member($org, 'c@x.test', 'coach');
        $this->assign($t1, $coach);
        $director = $this->member($org, 'd@x.test', 'director');
        \App\Models\DirectorScope::create(['organization_id' => $org->id, 'user_id' => $director->id, 'sport_id' => Sport::where('code', 'futbol')->value('id')]);
        $admin = $this->member($org, 'a@x.test', 'org_admin');

        $this->as($coach)->getJson($this->base.'/teams')->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.name', 'Sub-12');
        $this->as($coach)->getJson($this->base."/teams/{$t2->id}")->assertForbidden();
        $this->as($director)->getJson($this->base.'/teams')->assertJsonCount(2, 'data');
        $this->as($admin)->getJson($this->base.'/teams')->assertJsonCount(2, 'data');
    }

    public function test_equipo_de_otra_organizacion_no_se_ve(): void
    {
        $org = $this->makeOrg();
        $otra = $this->makeOrg('otra');
        $ajeno = $this->team($otra, 'Ajeno');
        $admin = $this->member($org, 'a@x.test', 'org_admin');
        $this->as($admin)->getJson($this->base."/teams/{$ajeno->id}")->assertNotFound();
    }

    public function test_solo_admin_crea_equipos_y_asigna_coaches(): void
    {
        $org = $this->makeOrg();
        $coach = $this->member($org, 'c@x.test', 'coach');
        $admin = $this->member($org, 'a@x.test', 'org_admin');
        $futbol = Sport::where('code', 'futbol')->value('id');

        $this->as($coach)->postJson($this->base.'/teams', ['name' => 'Equipo X', 'sport_id' => $futbol])->assertForbidden();

        $id = $this->as($admin)->postJson($this->base.'/teams', ['name' => 'Sub-12', 'sport_id' => $futbol, 'category' => 'Sub-12', 'color' => '#112233'])
            ->assertCreated()->assertJsonPath('data.sport.code', 'futbol')->json('data.id');

        $this->as($admin)->postJson($this->base."/teams/{$id}/staff", ['user_id' => $coach->id])->assertCreated();
        $this->as($coach)->getJson($this->base.'/teams')->assertJsonCount(1, 'data');

        $extra = $this->makeUser('noesmiembro@x.test');
        $this->as($admin)->postJson($this->base."/teams/{$id}/staff", ['user_id' => $extra->id])->assertStatus(422);

        $this->as($admin)->deleteJson($this->base."/teams/{$id}/staff/{$coach->id}")->assertOk();
        $this->as($coach)->getJson($this->base.'/teams')->assertJsonCount(0, 'data');
        $this->assertGreaterThan(0, AuditLog::where('action', 'team.staff_assigned')->count());
    }

    public function test_jugadores_permisos_y_datos_sensibles(): void
    {
        $org = $this->makeOrg();
        $t1 = $this->team($org, 'Sub-12');
        $t2 = $this->team($org, 'Sub-15');
        $coach = $this->member($org, 'c@x.test', 'coach');
        $this->assign($t1, $coach);
        $mio = $this->player($org, $t1, 'Ana');
        $ajeno = $this->player($org, $t2, 'Beto');

        $this->as($coach)->getJson($this->base.'/players')->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.first_name', 'Ana');
        $this->as($coach)->getJson($this->base."/players/{$ajeno->id}")->assertForbidden();
        $this->as($coach)->getJson($this->base."/players?team_id={$t2->id}")->assertForbidden();

        // Coach crea jugador solo en su equipo.
        $this->as($coach)->postJson($this->base.'/players', ['first_name' => 'Caro', 'last_name' => 'Ruiz'])->assertStatus(422);
        $this->as($coach)->postJson($this->base.'/players', ['first_name' => 'Caro', 'last_name' => 'Ruiz', 'team_id' => $t2->id])->assertForbidden();
        $id = $this->as($coach)->postJson($this->base.'/players', [
            'first_name' => 'Caro', 'last_name' => 'Ruiz', 'team_id' => $t1->id, 'jersey_number' => 10,
            'document_number' => '1234567890101', 'birthdate' => '2014-05-01',
        ])->assertCreated()->json('data.id');

        // El documento queda cifrado en la BD.
        $raw = \DB::table('players')->where('id', $id)->value('document_number');
        $this->assertStringNotContainsString('1234567890101', $raw);
        $this->assertSame('1234567890101', Player::find($id)->document_number);

        // Solo admin borra.
        $this->as($coach)->deleteJson($this->base."/players/{$id}")->assertForbidden();
    }

    public function test_plantilla_y_posicion_del_deporte(): void
    {
        $org = $this->makeOrg();
        $t1 = $this->team($org, 'Sub-12', 'futbol');
        $admin = $this->member($org, 'a@x.test', 'org_admin');
        $p = $this->player($org);
        $posBasket = \App\Models\SportPosition::whereHas('sport', fn ($q) => $q->where('code', 'basquetbol'))->value('id');
        $posFutbol = \App\Models\SportPosition::whereHas('sport', fn ($q) => $q->where('code', 'futbol'))->where('code', 'POR')->value('id');

        $this->as($admin)->postJson($this->base."/teams/{$t1->id}/roster", ['player_id' => $p->id, 'sport_position_id' => $posBasket])->assertStatus(422);
        $this->as($admin)->postJson($this->base."/teams/{$t1->id}/roster", ['player_id' => $p->id, 'sport_position_id' => $posFutbol, 'jersey_number' => 9])->assertCreated();
        $this->as($admin)->getJson($this->base."/teams/{$t1->id}/roster")->assertJsonPath('data.0.jersey_number', 9)->assertJsonPath('data.0.position.code', 'POR');

        // No se puede cambiar el deporte si ya hay jugadores.
        $this->as($admin)->patchJson($this->base."/teams/{$t1->id}", ['sport_id' => Sport::where('code', 'basquetbol')->value('id')])
            ->assertStatus(422)->assertJsonPath('error.code', 'sport_locked');
    }

    public function test_foto_privada_con_url_firmada(): void
    {
        Storage::fake('local');
        $org = $this->makeOrg();
        $admin = $this->member($org, 'a@x.test', 'org_admin');
        $p = $this->player($org);

        $this->as($admin)->postJson($this->base."/players/{$p->id}/photo", ['photo' => UploadedFile::fake()->create('x.php', 10, 'application/x-php')])->assertStatus(422);

        $url = $this->as($admin)->postJson($this->base."/players/{$p->id}/photo", ['photo' => UploadedFile::fake()->image('foto.jpg', 400, 400)])
            ->assertOk()->json('data.photo_url');
        $this->assertStringContainsString('signature=', $url);

        $this->app['auth']->forgetGuards();
        $this->get($url)->assertOk();
        $this->get(strtok($url, '?'))->assertForbidden();
        $this->travel(16)->minutes();
        $this->get($url)->assertForbidden();
    }

    public function test_miembros_admin(): void
    {
        $org = $this->makeOrg();
        $admin = $this->member($org, 'a@x.test', 'org_admin');
        $coach = $this->member($org, 'c@x.test', 'coach');
        $r = $this->as($admin)->getJson($this->base.'/members')->assertOk()->assertJsonCount(2, 'data');
        $coachMember = collect($r->json('data'))->firstWhere('user_id', $coach->id);

        $this->as($admin)->patchJson($this->base."/members/{$coachMember['id']}", ['status' => 'disabled'])->assertOk();
        $this->as($coach)->getJson($this->base.'/teams')->assertNotFound();

        $mine = collect($r->json('data'))->firstWhere('user_id', $admin->id);
        $this->as($admin)->patchJson($this->base."/members/{$mine['id']}", ['status' => 'disabled'])->assertStatus(422);
        $this->as($coach)->getJson($this->base.'/members')->assertNotFound();
    }
}
