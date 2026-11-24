<?php

namespace Tests\Feature;

use App\Models\DirectorScope;
use App\Models\Event;
use App\Models\Sport;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Support\BuildsOrgs;
use Tests\TestCase;

/** Deportes activados por la organización y catálogo con códigos en inglés. */
class OrgSportsTest extends TestCase
{
    use BuildsOrgs, RefreshDatabase;

    private string $base = '/api/pc/orgs/colegio-demo';

    private function id(string $code): int
    {
        return (int) Sport::where('code', $code)->value('id');
    }

    public function test_catalogo_en_ingles_y_posiciones_en_espanol(): void
    {
        $this->assertSame(
            ['soccer' => 'Soccer', 'futsal' => 'Futsal', 'basketball' => 'Basketball', 'volleyball' => 'Volleyball', 'american_football' => 'American Football', 'baseball' => 'Baseball'],
            Sport::orderBy('sort')->pluck('name', 'code')->all()
        );
        $this->assertSame('Portero', \App\Models\SportPosition::where('sport_id', $this->id('soccer'))->where('code', 'POR')->value('name'));
    }

    public function test_admin_activa_y_desactiva_deportes(): void
    {
        $org = $this->makeOrg();
        $admin = $this->member($org, 'a@x.test', 'org_admin');
        $coach = $this->member($org, 'c@x.test', 'coach');

        $this->as($admin)->getJson($this->base.'/sports')->assertOk()->assertJsonCount(0, 'data');
        $this->as($admin)->getJson($this->base.'/access')->assertJsonPath('data.permissions.manage_sports', true);
        $this->as($coach)->getJson($this->base.'/access')->assertJsonPath('data.permissions.manage_sports', false);

        // Sin activar, no se puede crear un equipo de ese deporte.
        $this->as($admin)->postJson($this->base.'/teams', ['name' => 'Sub-12', 'sport_id' => $this->id('soccer')])
            ->assertStatus(422)->assertJsonPath('error.code', 'sport_not_enabled');

        $this->as($coach)->putJson($this->base.'/sports', ['sport_ids' => [$this->id('soccer')]])->assertForbidden();
        $r = $this->as($admin)->putJson($this->base.'/sports', ['sport_ids' => [$this->id('soccer'), $this->id('basketball')]])->assertOk();
        $this->assertSame(['soccer', 'basketball'], collect($r->json('data'))->pluck('code')->all());
        $this->assertNotEmpty($r->json('data.0.positions'));
        $this->assertNotEmpty($r->json('data.0.stat_types'));
        // Repetir el mismo PUT no cambia nada (idempotente).
        $this->as($admin)->putJson($this->base.'/sports', ['sport_ids' => [$this->id('soccer'), $this->id('basketball')]])->assertOk()->assertJsonCount(2, 'data');

        $this->as($admin)->postJson($this->base.'/teams', ['name' => 'Sub-12', 'sport_id' => $this->id('soccer')])->assertCreated();

        // No se desactiva un deporte con equipos.
        $this->as($admin)->putJson($this->base.'/sports', ['sport_ids' => [$this->id('basketball')]])
            ->assertStatus(422)->assertJsonPath('error.code', 'sport_in_use')->assertJsonPath('error.sport_ids', [$this->id('soccer')]);

        // Sí se desactiva uno sin equipos.
        $this->as($admin)->putJson($this->base.'/sports', ['sport_ids' => [$this->id('soccer')]])->assertOk()->assertJsonCount(1, 'data');
        $this->as($admin)->putJson($this->base.'/sports', ['sport_ids' => [999999]])->assertStatus(422);
    }

    public function test_cada_rol_ve_solo_sus_deportes(): void
    {
        $org = $this->makeOrg();
        $admin = $this->member($org, 'a@x.test', 'org_admin');
        $f12 = $this->team($org, 'Fútbol Sub-12', 'soccer');
        $this->team($org, 'Básquet Juvenil', 'basketball');
        $org->sports()->attach($this->id('volleyball'));

        $dt = $this->member($org, 'dt@x.test', 'director');
        DirectorScope::create(['organization_id' => $org->id, 'user_id' => $dt->id, 'sport_id' => $this->id('volleyball')]);
        $coach = $this->member($org, 'c@x.test', 'coach');
        $this->assign($f12, $coach);

        $codes = fn ($u) => collect($this->as($u)->getJson($this->base.'/sports')->assertOk()->json('data'))->pluck('code')->all();
        $this->assertSame(['soccer', 'basketball', 'volleyball'], $codes($admin));
        $this->assertSame(['volleyball'], $codes($dt));
        $this->assertSame(['soccer'], $codes($coach));
    }

    public function test_alcance_de_director_solo_con_deportes_activados_y_se_limpia_al_desactivar(): void
    {
        $org = $this->makeOrg();
        $admin = $this->member($org, 'a@x.test', 'org_admin');
        $dt = $this->member($org, 'dt@x.test', 'director');
        $memberId = $org->members()->where('user_id', $dt->id)->value('id');

        $this->as($admin)->putJson($this->base."/members/{$memberId}/scopes", ['sport_ids' => [$this->id('baseball')], 'team_ids' => []])->assertStatus(422);
        $this->as($admin)->postJson($this->base.'/invitations', ['email' => 'n@x.test', 'role' => 'director', 'sport_ids' => [$this->id('baseball')]])->assertStatus(422);

        $this->as($admin)->putJson($this->base.'/sports', ['sport_ids' => [$this->id('baseball')]])->assertOk();
        $this->as($admin)->putJson($this->base."/members/{$memberId}/scopes", ['sport_ids' => [$this->id('baseball')], 'team_ids' => []])->assertOk();

        $this->as($admin)->putJson($this->base.'/sports', ['sport_ids' => []])->assertOk()->assertJsonCount(0, 'data');
        $this->assertSame(0, DirectorScope::where('user_id', $dt->id)->count());
    }

    public function test_eventos_filtrados_por_deporte(): void
    {
        $org = $this->makeOrg();
        $admin = $this->member($org, 'a@x.test', 'org_admin');
        $f = $this->team($org, 'Fútbol', 'soccer');
        $b = $this->team($org, 'Básquet', 'basketball');
        foreach ([$f, $b] as $t) {
            Event::create(['organization_id' => $org->id, 'team_id' => $t->id, 'type' => 'training', 'title' => 'Entreno', 'starts_at' => now()->addDay(), 'status' => 'scheduled']);
        }
        $from = now()->toDateString();
        $this->assertCount(2, $this->as($admin)->getJson($this->base."/events?from={$from}")->json('data'));
        $r = $this->as($admin)->getJson($this->base."/events?from={$from}&sport_id=".$this->id('basketball'))->assertOk();
        $this->assertSame([$b->id], collect($r->json('data'))->pluck('team_id')->all());
    }
}
