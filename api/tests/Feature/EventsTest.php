<?php

namespace Tests\Feature;

use App\Models\GuardianPlayer;
use App\Models\PlayerEventStat;
use App\Models\UserNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Support\BuildsOrgs;
use Tests\TestCase;

class EventsTest extends TestCase
{
    use BuildsOrgs, RefreshDatabase;

    private string $base = '/api/pc/orgs/colegio-demo';

    private function setupTeam(): array
    {
        $org = $this->makeOrg();
        $team = $this->team($org, 'Sub-12', 'soccer');
        $otro = $this->team($org, 'Sub-15', 'soccer');
        $coach = $this->member($org, 'c@x.test', 'coach');
        $this->assign($team, $coach);
        $ana = $this->player($org, $team, 'Ana');
        $beto = $this->player($org, $team, 'Beto');
        $papa = $this->makeUser('papa@x.test');
        GuardianPlayer::create(['user_id' => $papa->id, 'player_id' => $ana->id, 'verified_at' => now()]);

        return compact('org', 'team', 'otro', 'coach', 'ana', 'beto', 'papa');
    }

    private function crearPartido($coach, $team): int
    {
        return $this->as($coach)->postJson($this->base.'/events', [
            'team_id' => $team->id, 'type' => 'match', 'starts_at' => now()->addDays(3)->setTime(9, 0)->toDateTimeString(),
            'opponent_name' => 'Colegio Rival', 'home_away' => 'home', 'location' => 'Cancha 1',
        ])->assertCreated()->assertJsonPath('data.display_title', 'Partido vs Colegio Rival')->json('data.id');
    }

    public function test_coach_crea_y_ve_solo_eventos_de_sus_equipos(): void
    {
        ['coach' => $coach, 'team' => $team, 'otro' => $otro] = $this->setupTeam();
        $this->as($coach)->postJson($this->base.'/events', ['team_id' => $otro->id, 'type' => 'training', 'starts_at' => now()->addDay()])->assertForbidden();
        $id = $this->crearPartido($coach, $team);
        $this->as($coach)->getJson($this->base.'/events?from='.now()->toDateString().'&to='.now()->addDays(10)->toDateString())
            ->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.id', $id);
        $this->as($coach)->getJson($this->base.'/events?from=2026-01-01&to=2026-12-31')->assertStatus(422)->assertJsonPath('error.code', 'range_too_large');
    }

    public function test_convocatoria_avisa_una_vez_a_los_padres(): void
    {
        ['coach' => $coach, 'team' => $team, 'ana' => $ana, 'beto' => $beto, 'papa' => $papa] = $this->setupTeam();
        $id = $this->crearPartido($coach, $team);

        $this->as($coach)->putJson($this->base."/events/{$id}/callups", ['players' => [['player_id' => $ana->id], ['player_id' => $beto->id, 'status' => 'reserve']]])
            ->assertOk()->assertJsonPath('data.count', 2);
        $this->assertSame(1, UserNotification::where('user_id', $papa->id)->where('kind', 'callup')->count());
        $this->assertStringContainsString('Ana fue convocado(a)', UserNotification::first()->body);

        // Guardar de nuevo la misma lista no repite el aviso.
        $this->as($coach)->putJson($this->base."/events/{$id}/callups", ['players' => [['player_id' => $ana->id]]])->assertOk();
        $this->assertSame(1, UserNotification::where('user_id', $papa->id)->count());

        $ajeno = $this->player($this->makeOrg('otra'), null, 'Zoe');
        $this->as($coach)->putJson($this->base."/events/{$id}/callups", ['players' => [['player_id' => $ajeno->id]]])->assertStatus(422);
    }

    public function test_cancelar_avisa_a_los_padres(): void
    {
        ['coach' => $coach, 'team' => $team, 'papa' => $papa] = $this->setupTeam();
        $id = $this->crearPartido($coach, $team);
        $this->as($coach)->patchJson($this->base."/events/{$id}", ['status' => 'cancelled'])->assertOk()->assertJsonPath('data.status', 'cancelled');
        $this->assertSame(1, UserNotification::where('user_id', $papa->id)->where('kind', 'event_cancelled')->count());
    }

    public function test_asistencia(): void
    {
        ['coach' => $coach, 'team' => $team, 'ana' => $ana, 'beto' => $beto] = $this->setupTeam();
        $id = $this->as($coach)->postJson($this->base.'/events', ['team_id' => $team->id, 'type' => 'training', 'starts_at' => now()->subHour()])->json('data.id');
        $this->as($coach)->putJson($this->base."/events/{$id}/attendance", ['records' => [
            ['player_id' => $ana->id, 'status' => 'present'], ['player_id' => $beto->id, 'status' => 'excused', 'note' => 'Enfermo'],
        ]])->assertOk();
        $this->as($coach)->putJson($this->base."/events/{$id}/attendance", ['records' => [['player_id' => $beto->id, 'status' => 'late']]])->assertOk();
        $this->as($coach)->getJson($this->base."/events/{$id}")->assertOk()->assertJsonCount(2, 'data.attendance');
    }

    public function test_ficha_del_partido_estadisticas_y_aviso_de_resultado(): void
    {
        ['coach' => $coach, 'team' => $team, 'ana' => $ana, 'beto' => $beto, 'papa' => $papa] = $this->setupTeam();
        $id = $this->crearPartido($coach, $team);

        $sheet = [
            'score_us' => 2, 'score_them' => 1,
            'lineup' => [
                ['player_id' => $ana->id, 'is_starter' => true, 'minutes_played' => 60, 'jersey_number' => 9],
                ['player_id' => $beto->id, 'is_starter' => false, 'minutes_played' => 20],
            ],
            'actions' => [
                ['stat_code' => 'goal', 'player_id' => $ana->id, 'minute' => 10],
                ['stat_code' => 'goal', 'player_id' => $ana->id, 'minute' => 35],
                ['stat_code' => 'yellow_card', 'player_id' => $beto->id],
                ['type' => 'sub_in', 'player_id' => $beto->id, 'related_player_id' => $ana->id, 'minute' => 40],
            ],
        ];

        // Borrador: no avisa.
        $this->as($coach)->putJson($this->base."/events/{$id}/match-sheet", $sheet)->assertOk()->assertJsonPath('data.status', 'scheduled')->assertJsonPath('data.warnings', []);
        $this->assertSame(0, UserNotification::where('kind', 'match_result')->count());

        // Publicar: finaliza y avisa al padre de Ana con sus goles.
        $this->as($coach)->putJson($this->base."/events/{$id}/match-sheet", $sheet + ['publish' => true])->assertOk()->assertJsonPath('data.status', 'finished');
        $n = UserNotification::where('user_id', $papa->id)->where('kind', 'match_result')->first();
        $this->assertNotNull($n);
        $this->assertStringContainsString('Sub-12 2 - 1 Colegio Rival', $n->body);
        $this->assertStringContainsString('Ana: 2 gol', $n->body);

        $stats = PlayerEventStat::where('event_id', $id)->where('player_id', $ana->id)->first();
        $this->assertSame(['goal' => 2], $stats->stats);
        $this->assertSame(60, $stats->minutes_played);

        // Volver a guardar igual (reintento): sin duplicar nada.
        $this->as($coach)->putJson($this->base."/events/{$id}/match-sheet", $sheet + ['publish' => true])->assertOk();
        $this->assertSame(1, UserNotification::where('kind', 'match_result')->count());
        $this->assertSame(2, PlayerEventStat::where('event_id', $id)->count());

        // Corregir el marcador: aviso de corrección.
        $sheet['score_us'] = 3;
        $sheet['actions'][] = ['stat_code' => 'goal', 'player_id' => $beto->id];
        $this->as($coach)->putJson($this->base."/events/{$id}/match-sheet", $sheet + ['publish' => true])->assertOk();
        $this->assertSame(2, UserNotification::where('kind', 'match_result')->count());
        $this->assertStringStartsWith('Resultado corregido', UserNotification::orderByDesc('id')->first()->title);

        // No se puede borrar con resultado publicado.
        $this->as($coach)->deleteJson($this->base."/events/{$id}")->assertStatus(422);
    }

    public function test_ficha_valida_deporte_y_plantilla_y_avisa_si_no_cuadra(): void
    {
        ['coach' => $coach, 'team' => $team, 'ana' => $ana] = $this->setupTeam();
        $id = $this->crearPartido($coach, $team);

        $this->as($coach)->putJson($this->base."/events/{$id}/match-sheet", [
            'score_us' => 1, 'score_them' => 0, 'lineup' => [], 'actions' => [['stat_code' => 'point_3', 'player_id' => $ana->id]],
        ])->assertStatus(422);

        $this->as($coach)->putJson($this->base."/events/{$id}/match-sheet", [
            'score_us' => 3, 'score_them' => 0, 'lineup' => [], 'actions' => [['stat_code' => 'goal', 'player_id' => $ana->id]],
        ])->assertOk()->assertJsonCount(1, 'data.warnings');
    }

    public function test_ficha_solo_para_partidos(): void
    {
        ['coach' => $coach, 'team' => $team] = $this->setupTeam();
        $id = $this->as($coach)->postJson($this->base.'/events', ['team_id' => $team->id, 'type' => 'training', 'starts_at' => now()])->json('data.id');
        $this->as($coach)->putJson($this->base."/events/{$id}/match-sheet", ['score_us' => 0, 'score_them' => 0, 'lineup' => [], 'actions' => []])
            ->assertStatus(422)->assertJsonPath('error.code', 'not_a_match');
    }
}
