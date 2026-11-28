<?php

namespace Tests\Feature;

use App\Models\GuardianPlayer;
use App\Models\Sport;
use App\Models\TeamPlayer;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Support\BuildsOrgs;
use Tests\TestCase;

/** Evaluación del coach (radar 0–100) por deporte; el padre la ve en la App. */
class EvaluationTest extends TestCase
{
    use BuildsOrgs, RefreshDatabase;

    private string $base = '/api/pc/orgs/colegio-demo';

    public function test_coach_evalua_y_el_padre_la_ve(): void
    {
        $org = $this->makeOrg();
        $f = $this->team($org, 'Sub-12', 'soccer');
        $b = $this->team($org, 'Básquet', 'basketball');
        $coach = $this->member($org, 'c@x.test', 'coach');
        $this->assign($f, $coach);
        $otroCoach = $this->member($org, 'c2@x.test', 'coach');
        $this->assign($b, $otroCoach);
        $ana = $this->player($org, $f, 'Ana');
        TeamPlayer::create(['team_id' => $b->id, 'player_id' => $ana->id, 'active' => true]);
        $papa = $this->guardian('papa@x.test');
        GuardianPlayer::create(['user_id' => $papa->id, 'player_id' => $ana->id]);
        $soccer = Sport::where('code', 'soccer')->value('id');
        $vals = ['attitude' => 90, 'speed' => 70, 'technique' => 80, 'physical' => 65, 'tactics' => 75];

        $this->as($papa)->getJson("/api/app/children/{$ana->id}/evaluation?sport_id={$soccer}")->assertOk()->assertJsonPath('data.attributes', null);
        $this->as($coach)->getJson($this->base."/players/{$ana->id}/evaluation?sport_id={$soccer}")->assertOk()
            ->assertJsonPath('data.can_edit', true)->assertJsonCount(5, 'data.catalog');

        // Validaciones y permisos.
        $this->as($coach)->putJson($this->base."/players/{$ana->id}/evaluation", ['sport_id' => $soccer, 'attributes' => ['attitude' => 101] + $vals])->assertStatus(422);
        $this->as($coach)->putJson($this->base."/players/{$ana->id}/evaluation", ['sport_id' => $soccer, 'attributes' => ['speed' => 70]])->assertStatus(422);
        $this->as($otroCoach)->putJson($this->base."/players/{$ana->id}/evaluation", ['sport_id' => $soccer, 'attributes' => $vals])->assertForbidden();
        $this->as($coach)->putJson($this->base."/players/{$ana->id}/evaluation", ['sport_id' => Sport::where('code', 'baseball')->value('id'), 'attributes' => $vals])->assertStatus(422);

        $this->as($coach)->putJson($this->base."/players/{$ana->id}/evaluation", ['sport_id' => $soccer, 'attributes' => $vals])->assertOk()
            ->assertJsonPath('data.attributes.0', ['code' => 'attitude', 'name' => 'Actitud', 'value' => 90]);
        $this->as($coach)->putJson($this->base."/players/{$ana->id}/evaluation", ['sport_id' => $soccer, 'attributes' => ['attitude' => 95] + $vals])->assertOk();

        $r = $this->as($papa)->getJson("/api/app/children/{$ana->id}/evaluation?sport_id={$soccer}")->assertOk();
        $this->assertSame([95, 70, 80, 65, 75], collect($r->json('data.attributes'))->pluck('value')->all());
        $this->assertNotNull($r->json('data.updated_at'));
        // Otro deporte, aún sin evaluar.
        $this->as($papa)->getJson("/api/app/children/{$ana->id}/evaluation?sport_id=".Sport::where('code', 'basketball')->value('id'))->assertJsonPath('data.attributes', null);
        // Otro padre no la ve.
        $this->as($this->guardian('otro@x.test'))->getJson("/api/app/children/{$ana->id}/evaluation?sport_id={$soccer}")->assertForbidden();
    }
}
