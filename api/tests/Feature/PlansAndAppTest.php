<?php

namespace Tests\Feature;

use App\Models\Event;
use App\Models\GuardianPlayer;
use App\Models\PlanGrant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Support\BuildsOrgs;
use Tests\TestCase;

class PlansAndAppTest extends TestCase
{
    use BuildsOrgs, RefreshDatabase;

    private string $base = '/api/pc/orgs/colegio-demo';

    private function escenario(): array
    {
        $org = $this->makeOrg();
        $org->update(['quota_pro' => 1, 'quota_premium' => 1]);
        $team = $this->team($org, 'Sub-12', 'soccer');
        $admin = $this->member($org, 'a@x.test', 'org_admin');
        $coach = $this->member($org, 'c@x.test', 'coach');
        $this->assign($team, $coach);
        $ana = $this->player($org, $team, 'Ana');
        $luis = $this->player($org, $team, 'Luis');
        $otro = $this->player($org, $team, 'Otro');
        $papa = $this->guardian('papa@x.test');
        GuardianPlayer::create(['user_id' => $papa->id, 'player_id' => $ana->id]);
        GuardianPlayer::create(['user_id' => $papa->id, 'player_id' => $luis->id]);

        return compact('org', 'team', 'admin', 'coach', 'ana', 'luis', 'otro', 'papa');
    }

    private function partido($org, $team, $daysAgo, $us = 1, $them = 0): Event
    {
        return Event::create([
            'organization_id' => $org->id, 'team_id' => $team->id, 'type' => 'match', 'status' => 'finished',
            'starts_at' => now()->subDays($daysAgo), 'score_us' => $us, 'score_them' => $them,
            'result_published_at' => now()->subDays($daysAgo), 'opponent_name' => 'Rival', 'notes' => 'nota interna',
        ]);
    }

    public function test_hijos_con_marca_y_plan_gratis(): void
    {
        ['papa' => $papa] = $this->escenario();
        $this->as($papa)->getJson('/api/app/children')->assertOk()->assertJsonCount(2, 'data')
            ->assertJsonPath('data.0.organization.slug', 'colegio-demo')
            ->assertJsonPath('data.0.plan_level', 'free')
            ->assertJsonPath('data.0.teams.0.sport.code', 'soccer');
        $this->as($papa)->getJson('/api/app/plan')->assertOk()->assertJsonPath('data.level', 'free')->assertJsonMissingPath('data.price');
    }

    public function test_padre_no_ve_hijos_ajenos(): void
    {
        ['papa' => $papa, 'otro' => $otro] = $this->escenario();
        $this->as($papa)->getJson("/api/app/children/{$otro->id}/events")->assertForbidden();
        $this->as($papa)->getJson("/api/app/children/{$otro->id}/stats")->assertForbidden();
    }

    public function test_limite_de_historial_en_gratis_y_premium_sin_limite(): void
    {
        ['org' => $org, 'team' => $team, 'papa' => $papa, 'ana' => $ana, 'admin' => $admin] = $this->escenario();
        $viejo = $this->partido($org, $team, 60);
        $reciente = $this->partido($org, $team, 5);

        $r = $this->as($papa)->getJson("/api/app/children/{$ana->id}/events?from=".now()->subDays(90)->toDateString().'&to='.now()->toDateString())->assertOk();
        $this->assertSame([$reciente->id], collect($r->json('data'))->pluck('id')->all());
        $r->assertJsonPath('meta.history_limited', true)->assertJsonMissingPath('data.0.notes');
        $this->as($papa)->getJson("/api/app/children/{$ana->id}/events/{$viejo->id}")->assertForbidden()->assertJsonPath('error.code', 'plan_limit');
        $this->assertStringNotContainsStringIgnoringCase('pag', $this->as($papa)->getJson("/api/app/children/{$ana->id}/events/{$viejo->id}")->json('error.message'));

        // El admin asigna Premium.
        $this->as($admin)->postJson($this->base.'/plans', ['email' => 'papa@x.test', 'plan' => 'premium'])->assertCreated()
            ->assertJsonPath('meta.usage.premium.used', 1);
        $this->as($papa)->getJson("/api/app/children/{$ana->id}/events/{$viejo->id}")->assertOk();
        $this->as($papa)->getJson('/api/app/plan')->assertJsonPath('data.level', 'premium')->assertJsonPath('data.assigned_by', 'Org colegio-demo');
    }

    public function test_cupo_e_idempotencia_de_planes(): void
    {
        ['org' => $org, 'admin' => $admin, 'ana' => $ana] = $this->escenario();
        $mama = $this->guardian('mama@x.test');
        GuardianPlayer::create(['user_id' => $mama->id, 'player_id' => $ana->id]);

        $this->as($admin)->postJson($this->base.'/plans', ['email' => 'papa@x.test', 'plan' => 'premium'])->assertCreated();
        $this->as($admin)->postJson($this->base.'/plans', ['email' => 'papa@x.test', 'plan' => 'premium'])->assertCreated(); // mismo grant
        $this->assertSame(1, PlanGrant::count());
        $this->as($admin)->postJson($this->base.'/plans', ['email' => 'mama@x.test', 'plan' => 'premium'])
            ->assertStatus(422)->assertJsonPath('error.code', 'quota_exceeded');

        $this->as($admin)->postJson($this->base.'/plans', ['email' => 'nadie@x.test', 'plan' => 'pro'])->assertStatus(422)->assertJsonPath('error.code', 'not_a_guardian');

        // Revocar libera cupo.
        $id = PlanGrant::first()->id;
        $this->as($admin)->deleteJson($this->base."/plans/{$id}")->assertOk()->assertJsonPath('meta.usage.premium.used', 0);
        $this->as($admin)->postJson($this->base.'/plans', ['email' => 'mama@x.test', 'plan' => 'premium'])->assertCreated();
    }

    public function test_coach_no_asigna_planes(): void
    {
        ['coach' => $coach] = $this->escenario();
        $this->as($coach)->postJson($this->base.'/plans', ['email' => 'papa@x.test', 'plan' => 'pro'])->assertForbidden();
    }

    public function test_pro_solo_para_un_hijo_y_cambio_limitado(): void
    {
        ['org' => $org, 'team' => $team, 'admin' => $admin, 'papa' => $papa, 'ana' => $ana, 'luis' => $luis] = $this->escenario();
        $viejo = $this->partido($org, $team, 60);
        $this->as($admin)->postJson($this->base.'/plans', ['email' => 'papa@x.test', 'plan' => 'pro'])->assertCreated();

        // Con 2 hijos no se elige solo: ambos en gratis hasta elegir.
        $this->as($papa)->getJson('/api/app/plan')->assertJsonPath('data.level', 'pro')->assertJsonPath('data.pro_player_id', null);
        $this->as($papa)->postJson('/api/app/plan/pro-child', ['player_id' => $ana->id])->assertOk();
        $this->as($papa)->getJson("/api/app/children/{$ana->id}/events/{$viejo->id}")->assertOk();
        $this->as($papa)->getJson("/api/app/children/{$luis->id}/events/{$viejo->id}")->assertForbidden();

        $this->as($papa)->postJson('/api/app/plan/pro-child', ['player_id' => $luis->id])->assertOk(); // primer cambio libre (no había cambio previo registrado)
        $this->as($papa)->postJson('/api/app/plan/pro-child', ['player_id' => $ana->id])->assertStatus(422)->assertJsonPath('error.code', 'pro_child_locked');
    }

    public function test_respuesta_a_convocatoria_y_detalle_privado(): void
    {
        ['org' => $org, 'team' => $team, 'coach' => $coach, 'papa' => $papa, 'ana' => $ana, 'otro' => $otro] = $this->escenario();
        $id = $this->as($coach)->postJson($this->base.'/events', ['team_id' => $team->id, 'type' => 'match', 'starts_at' => now()->addDays(2), 'opponent_name' => 'Rival'])->json('data.id');
        $this->as($coach)->putJson($this->base."/events/{$id}/callups", ['players' => [['player_id' => $ana->id], ['player_id' => $otro->id]]])->assertOk();

        $this->as($papa)->postJson("/api/app/children/{$ana->id}/events/{$id}/callup-response", ['response' => 'confirmed'])->assertOk()->assertJsonPath('data.response', 'confirmed');
        $this->as($papa)->getJson("/api/app/children/{$ana->id}/events/{$id}")->assertOk()
            ->assertJsonPath('data.callup.response', 'confirmed')
            ->assertJsonMissingPath('data.callups'); // no ve la lista de otros
        $this->as($coach)->getJson($this->base."/events/{$id}")->assertJsonPath('data.callups.0.guardian_response', 'confirmed');
    }

    public function test_estadisticas_del_hijo_limitadas_en_gratis(): void
    {
        ['org' => $org, 'team' => $team, 'papa' => $papa, 'ana' => $ana] = $this->escenario();
        for ($i = 1; $i <= 7; $i++) {
            $e = $this->partido($org, $team, $i);
            \App\Models\PlayerEventStat::create(['event_id' => $e->id, 'player_id' => $ana->id, 'minutes_played' => 10, 'stats' => ['goal' => 1]]);
        }
        $this->as($papa)->getJson("/api/app/children/{$ana->id}/stats")->assertOk()
            ->assertJsonPath('data.by_sport.0.matches', 5)
            ->assertJsonPath('data.by_sport.0.stats.0.code', 'goal')
            ->assertJsonPath('data.by_sport.0.stats.0.value', 5)
            ->assertJsonPath('meta.limited', true);
    }

    public function test_borrar_cuenta(): void
    {
        ['papa' => $papa, 'admin' => $admin] = $this->escenario();
        $this->as($papa)->deleteJson('/api/app/account', ['password' => 'mala'])->assertStatus(422);
        $this->as($papa)->deleteJson('/api/app/account', ['password' => 'ClaveSegura2026'])->assertOk();
        $this->assertSame(0, GuardianPlayer::where('user_id', $papa->id)->count());
        $this->assertNull(User::where('email', 'papa@x.test')->first());
        $this->assertTrue(User::withTrashed()->find($papa->id)->trashed());

        // El correo queda libre para registrarse de nuevo.
        $this->guardian('papa@x.test');

        // Una cuenta de staff no usa las rutas de la App.
        $this->as($admin)->deleteJson('/api/app/account', ['password' => 'ClaveSegura2026'])->assertForbidden();
    }
}
