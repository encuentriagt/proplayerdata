<?php

namespace Tests\Feature;

use App\Models\DirectorScope;
use App\Models\Event;
use App\Models\MatchLineup;
use App\Models\Sport;
use App\Models\SportPosition;
use App\Models\TeamPlayer;
use App\Support\Positions;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Support\BuildsOrgs;
use Tests\TestCase;

/** Posiciones por organización y deporte, editables por admin, director (su alcance) y coach (deportes de sus equipos). */
class OrgPositionsTest extends TestCase
{
    use BuildsOrgs, RefreshDatabase;

    private string $base = '/api/pc/orgs/colegio-demo';

    private function id(string $code): int
    {
        return (int) Sport::where('code', $code)->value('id');
    }

    public function test_activar_copia_el_catalogo_y_cada_colegio_edita_su_lista(): void
    {
        $org = $this->makeOrg();
        $otra = $this->makeOrg('otra');
        $admin = $this->member($org, 'a@x.test', 'org_admin');
        $catalogo = SportPosition::whereNull('organization_id')->where('sport_id', $this->id('soccer'))->count();

        $this->as($admin)->putJson($this->base.'/sports', ['sport_ids' => [$this->id('soccer')]])->assertOk()
            ->assertJsonCount($catalogo, 'data.0.positions');
        Positions::enableSports($otra, [$this->id('soccer')]);

        $mine = SportPosition::where('organization_id', $org->id)->where('code', 'POR')->firstOrFail();
        $this->as($admin)->patchJson($this->base."/positions/{$mine->id}", ['name' => 'Arquero'])->assertOk()->assertJsonPath('data.name', 'Arquero');
        $this->assertSame('Portero', SportPosition::where('organization_id', $otra->id)->where('code', 'POR')->value('name'));
        $this->assertSame('Portero', SportPosition::whereNull('organization_id')->where('sport_id', $this->id('soccer'))->where('code', 'POR')->value('name'));

        // No se edita la posición de otra organización.
        $ajena = SportPosition::where('organization_id', $otra->id)->first();
        $this->as($admin)->patchJson($this->base."/positions/{$ajena->id}", ['name' => 'X'])->assertNotFound();

        // Desactivar y volver a activar no duplica ni pisa la lista editada.
        $this->as($admin)->putJson($this->base.'/sports', ['sport_ids' => []])->assertOk();
        $this->as($admin)->putJson($this->base.'/sports', ['sport_ids' => [$this->id('soccer')]])->assertOk();
        $this->assertSame($catalogo, SportPosition::where('organization_id', $org->id)->count());
        $this->assertSame('Arquero', $mine->fresh()->name);
    }

    public function test_crear_borrar_y_position_in_use(): void
    {
        $org = $this->makeOrg();
        $team = $this->team($org, 'Sub-12', 'soccer');
        $coach = $this->member($org, 'c@x.test', 'coach');
        $this->assign($team, $coach);
        $soccer = $this->id('soccer');

        $this->as($coach)->getJson($this->base.'/access')->assertJsonPath('data.permissions.manage_positions', [$soccer]);
        $r = $this->as($coach)->postJson($this->base."/sports/{$soccer}/positions", ['name' => 'Líbero'])->assertCreated();
        $libero = $r->json('data.id');
        $this->assertSame('LIB', $r->json('data.code'));
        $this->as($coach)->postJson($this->base."/sports/{$soccer}/positions", ['name' => 'líbero'])->assertStatus(422);
        $this->as($coach)->postJson($this->base."/sports/{$soccer}/positions", ['name' => 'Libre'])->assertCreated()->assertJsonPath('data.code', 'LIB2');
        // Deporte que no es suyo.
        $this->as($coach)->postJson($this->base.'/sports/'.$this->id('basketball').'/positions', ['name' => 'Pívot'])->assertForbidden();

        $this->as($coach)->getJson($this->base.'/sports')->assertJsonFragment(['name' => 'Líbero']);
        $this->as($coach)->getJson($this->base."/teams/{$team->id}")->assertJsonFragment(['name' => 'Líbero']);

        // En uso en una plantilla activa: no se borra.
        $ana = $this->player($org, $team, 'Ana');
        $this->as($coach)->patchJson($this->base."/teams/{$team->id}/roster/{$ana->id}", ['sport_position_id' => $libero])->assertOk();
        $this->as($coach)->deleteJson($this->base."/positions/{$libero}")->assertStatus(422)->assertJsonPath('error.code', 'position_in_use');

        // Una ficha pasada no bloquea y conserva el nombre.
        $event = Event::create(['organization_id' => $org->id, 'team_id' => $team->id, 'type' => 'match', 'status' => 'finished', 'starts_at' => now()->subDay()]);
        MatchLineup::create(['event_id' => $event->id, 'player_id' => $ana->id, 'sport_position_id' => $libero]);
        TeamPlayer::where('player_id', $ana->id)->update(['sport_position_id' => null]);
        $this->as($coach)->deleteJson($this->base."/positions/{$libero}")->assertOk();
        $this->as($coach)->getJson($this->base."/events/{$event->id}")->assertJsonPath('data.lineup.0.position_name', 'Líbero');
        $this->assertNotContains('Líbero', collect($this->as($coach)->getJson($this->base.'/sports')->json('data.0.positions'))->pluck('name')->all());
        // Ya no se puede asignar en la plantilla.
        $this->as($coach)->patchJson($this->base."/teams/{$team->id}/roster/{$ana->id}", ['sport_position_id' => $libero])->assertStatus(422);
    }

    public function test_director_edita_solo_su_alcance(): void
    {
        $org = $this->makeOrg();
        $admin = $this->member($org, 'a@x.test', 'org_admin');
        Positions::enableSports($org, [$this->id('soccer'), $this->id('volleyball')]);
        $dt = $this->member($org, 'dt@x.test', 'director');
        DirectorScope::create(['organization_id' => $org->id, 'user_id' => $dt->id, 'sport_id' => $this->id('volleyball')]);

        $this->as($admin)->getJson($this->base.'/access')->assertJsonPath('data.permissions.manage_positions', [$this->id('soccer'), $this->id('volleyball')]);
        $this->as($dt)->postJson($this->base.'/sports/'.$this->id('volleyball').'/positions', ['name' => 'Opuesto 2'])->assertCreated();
        $this->as($dt)->postJson($this->base.'/sports/'.$this->id('soccer').'/positions', ['name' => 'Carrilero'])->assertForbidden();
        $pos = SportPosition::where('organization_id', $org->id)->where('sport_id', $this->id('soccer'))->first();
        $this->as($dt)->deleteJson($this->base."/positions/{$pos->id}")->assertForbidden();
    }
}
