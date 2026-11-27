<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Support\BuildsOrgs;
use Tests\TestCase;

class SeasonCycleApiTest extends TestCase
{
    use BuildsOrgs, RefreshDatabase;

    public function test_vista_previa_y_temporada_guardada_traen_el_ciclo(): void
    {
        $org = $this->makeOrg();
        $admin = $this->member($org, 'a@x.test', 'org_admin');
        $b = '/api/pc/orgs/colegio-demo/seasons';
        $this->as($admin)->getJson($b.'/cycle?starts_on=2026-08-01&ends_on=2027-06-30')->assertOk()->assertJsonPath('data.cycle', 'american');
        $this->as($admin)->getJson($b.'/cycle?starts_on=2026-08-01&ends_on=2026-01-01')->assertStatus(422);
        $this->as($admin)->postJson($b, ['name' => '2026', 'starts_on' => '2026-01-01', 'ends_on' => '2026-12-31'])->assertCreated()
            ->assertJsonPath('data.cycle', 'guatemalan')->assertJsonPath('data.cycle_label', 'Ciclo guatemalteco')
            ->assertJsonStructure(['data' => ['progress' => ['status', 'percent', 'percent_exact', 'days_total', 'days_elapsed', 'days_left']]]);
        $this->as($admin)->getJson($b)->assertJsonPath('data.0.cycle', 'guatemalan');
    }
}
