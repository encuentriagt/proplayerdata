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
        $papa = $this->guardian('papa@x.test');
        GuardianPlayer::create(['user_id' => $papa->id, 'player_id' => $ana->id, 'verified_at' => now()]);

        return compact('org', 'team', 'otro', 'coach', 'ana', 'beto', 'papa');
    }

    private function crearPartido($coach, $team): int
    {
        return $this->as($coach)->postJson($this->base.'/events', [
            'team_id' => $team->id, 'type' => 'match', 'starts_at' => now()->addDays(3)->setTime(9, 0)->toDateTimeString(),
            'opponent_name' => 'Colegio Rival', 'home_away' => 'home', 'location' => 'Cancha 1',
        ])->assertCreated()->assertJsonPath('data.display_title', 'Sub-12 vs Colegio Rival')->json('data.id');
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

    public function test_borrador_no_avisa_ni_aparece_en_la_app_hasta_publicar(): void
    {
        ['coach' => $coach, 'team' => $team, 'otro' => $otro, 'ana' => $ana, 'beto' => $beto, 'papa' => $papa] = $this->setupTeam();
        $when = now()->addDays(3)->setTime(9, 0)->toDateTimeString();

        // Crear y convocar en una sola llamada, como borrador.
        $id = $this->as($coach)->postJson($this->base.'/events', [
            'team_id' => $team->id, 'type' => 'match', 'starts_at' => $when, 'opponent_name' => 'Colegio Rival',
            'publish' => false, 'callups' => [['player_id' => $ana->id], ['player_id' => $beto->id, 'status' => 'reserve']],
        ])->assertCreated()->assertJsonPath('data.is_draft', true)->assertJsonPath('data.published_at', null)->json('data.id');
        $this->assertSame(0, UserNotification::count());
        $this->as($coach)->getJson($this->base."/events/{$id}")->assertJsonPath('data.is_draft', true)->assertJsonCount(2, 'data.callups');
        $this->as($coach)->getJson($this->base.'/events?from='.now()->toDateString())->assertJsonPath('data.0.is_draft', true);

        // Editar, cambiar la fecha o la convocatoria del borrador no avisa.
        $this->as($coach)->patchJson($this->base."/events/{$id}", ['starts_at' => now()->addDays(4)->toDateTimeString()])->assertOk();
        $this->as($coach)->putJson($this->base."/events/{$id}/callups", ['players' => [['player_id' => $ana->id]]])->assertOk();
        $this->assertSame(0, UserNotification::count());

        // La App no lo ve; la ficha tampoco se puede llenar.
        $from = now()->toDateString();
        $this->as($papa)->getJson("/api/app/children/{$ana->id}/events?from={$from}")->assertOk()->assertJsonCount(0, 'data');
        $this->as($papa)->getJson("/api/app/children/{$ana->id}/events/{$id}")->assertNotFound();
        $this->as($coach)->putJson($this->base."/events/{$id}/match-sheet", ['score_us' => 1, 'score_them' => 0, 'lineup' => [], 'actions' => []])
            ->assertStatus(422)->assertJsonPath('error.code', 'event_draft');

        // Otro coach no lo publica.
        $otroCoach = $this->member($team->organization, 'c2@x.test', 'coach');
        $this->assign($otro, $otroCoach);
        $this->as($otroCoach)->postJson($this->base."/events/{$id}/publish")->assertForbidden();

        // Publicar: aparece en la App y avisa a los padres de los convocados, una sola vez.
        $this->as($coach)->postJson($this->base."/events/{$id}/publish")->assertOk()->assertJsonPath('data.is_draft', false);
        $this->assertSame(1, UserNotification::where('user_id', $papa->id)->where('kind', 'callup')->count());
        $this->as($coach)->postJson($this->base."/events/{$id}/publish")->assertOk()->assertJsonPath('data.is_draft', false);
        $this->assertSame(1, UserNotification::count());
        $this->as($papa)->getJson("/api/app/children/{$ana->id}/events?from={$from}")->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.display_title', 'Sub-12 vs Colegio Rival');
    }

    public function test_publicar_partido_requiere_convocados(): void
    {
        ['coach' => $coach, 'team' => $team, 'ana' => $ana] = $this->setupTeam();
        $base = ['team_id' => $team->id, 'type' => 'match', 'starts_at' => now()->addDays(2)->toDateTimeString(), 'opponent_name' => 'X'];
        $this->as($coach)->postJson($this->base.'/events', $base + ['publish' => true])->assertStatus(422)->assertJsonPath('error.code', 'callups_required');
        $this->as($coach)->postJson($this->base.'/events', $base + ['publish' => true, 'callups' => []])->assertStatus(422);
        // Entreno publicado también exige convocados; tipo "otro" no.
        $this->as($coach)->postJson($this->base.'/events', ['team_id' => $team->id, 'type' => 'training', 'starts_at' => now()->addDay()->toDateTimeString(), 'publish' => true])->assertStatus(422)->assertJsonPath('error.code', 'callups_required');
        $this->as($coach)->postJson($this->base.'/events', ['team_id' => $team->id, 'type' => 'other', 'starts_at' => now()->addDay()->toDateTimeString(), 'publish' => true])->assertCreated();
        $id = $this->as($coach)->postJson($this->base.'/events', $base + ['publish' => false])->assertCreated()->json('data.id');
        $this->as($coach)->postJson($this->base."/events/{$id}/publish")->assertStatus(422)->assertJsonPath('error.code', 'callups_required');
        $this->as($coach)->putJson($this->base."/events/{$id}/callups", ['players' => [['player_id' => $ana->id]]])->assertOk();
        $this->as($coach)->postJson($this->base."/events/{$id}/publish")->assertOk();
    }

    public function test_asistencia_lesion_quitar_y_avisos(): void
    {
        ['coach' => $coach, 'team' => $team, 'ana' => $ana, 'beto' => $beto, 'papa' => $papa] = $this->setupTeam();
        $q = fn () => UserNotification::where('user_id', $papa->id)->where('kind', 'attendance');
        $id = $this->as($coach)->postJson($this->base.'/events', [
            'team_id' => $team->id, 'type' => 'match', 'starts_at' => now()->subHour()->toDateTimeString(), 'opponent_name' => 'X',
            'publish' => false, 'callups' => [['player_id' => $ana->id]],
        ])->json('data.id');

        $inj = fn () => UserNotification::where('user_id', $papa->id)->where('kind', 'injury');
        // En borrador: la asistencia normal no avisa, pero la LESIÓN sí (urgente).
        $this->as($coach)->putJson($this->base."/events/{$id}/attendance", ['records' => [['player_id' => $ana->id, 'status' => 'injured', 'note' => 'Tobillo'], ['player_id' => $beto->id, 'status' => 'present']]])
            ->assertOk()->assertJsonPath('data.notified', 1);
        $this->assertSame(0, $q()->count());
        $this->assertSame('Ana se lesionó en Sub-12 vs X. Nota del coach: Tobillo', $inj()->value('body'));
        $this->assertSame('Tobillo', $inj()->first()->data['note']);
        // Al publicar no se repite la lesión.
        $this->as($coach)->postJson($this->base."/events/{$id}/publish")->assertOk();
        $this->assertSame(0, $q()->count());
        $this->assertSame(1, $inj()->count());

        // Guardar igual no repite; corregir avisa solo al que cambió.
        $this->as($coach)->putJson($this->base."/events/{$id}/attendance", ['records' => [['player_id' => $ana->id, 'status' => 'injured']]])->assertJsonPath('data.notified', 0);
        $this->as($coach)->putJson($this->base."/events/{$id}/attendance", ['records' => [['player_id' => $ana->id, 'status' => 'present']]])->assertJsonPath('data.notified', 1);
        $this->as($coach)->putJson($this->base."/events/{$id}/attendance", ['records' => [['player_id' => $ana->id, 'status' => 'injured']]])->assertJsonPath('data.notified', 1);
        $this->assertSame([1, 2], [$q()->count(), $inj()->count()]);

        // "Enterado" del padre: lo ve el coach en la PC.
        $nid = $inj()->latest('id')->value('id');
        $this->as($coach)->getJson($this->base."/events/{$id}")->assertJsonPath('data.attendance.0.injury_acked_at', null);
        $this->as($papa)->postJson("/api/me/notifications/{$nid}/ack")->assertOk()->assertJsonPath('data.read', true);
        $this->assertNotNull(collect($this->as($coach)->getJson($this->base."/events/{$id}")->json('data.attendance'))->firstWhere('player_id', $ana->id)['injury_acked_at']);
        $this->as($coach)->postJson("/api/me/notifications/{$nid}/ack")->assertNotFound();

        // status null quita la marca; "late" ya no se acepta.
        $this->as($coach)->putJson($this->base."/events/{$id}/attendance", ['records' => [['player_id' => $beto->id, 'status' => null]]])->assertOk();
        $this->as($coach)->getJson($this->base."/events/{$id}")->assertJsonCount(1, 'data.attendance');
        // "Llegó tarde" (late) vuelve a existir: avisa y cuenta aparte.
        $this->as($coach)->putJson($this->base."/events/{$id}/attendance", ['records' => [['player_id' => $ana->id, 'status' => 'late']]])->assertJsonPath('data.notified', 1);
        $this->assertSame('Ana: Llegó tarde.', $q()->latest('id')->value('body'));
        // Lesión en un entreno también avisa.
        $tr = $this->as($coach)->postJson($this->base.'/events', ['team_id' => $team->id, 'type' => 'training', 'starts_at' => now()->subHour()->toDateTimeString(), 'publish' => true, 'callups' => [['player_id' => $ana->id]]])->json('data.id');
        $this->as($coach)->putJson($this->base."/events/{$tr}/attendance", ['records' => [['player_id' => $ana->id, 'status' => 'injured']]])->assertJsonPath('data.notified', 1);
        $this->as($coach)->putJson($this->base."/events/{$tr}/attendance", ['records' => [['player_id' => $ana->id, 'status' => 'late']]])->assertJsonPath('data.notified', 0);
        $this->as($papa)->getJson("/api/app/children/{$ana->id}/stats")->assertJsonPath('data.attendance.late', 2);
        $this->as($coach)->putJson($this->base."/events/{$id}/attendance", ['records' => [['player_id' => $ana->id, 'status' => 'injured']]])->assertOk();
        $this->as($coach)->putJson($this->base."/events/{$id}/attendance", ['records' => [['player_id' => $ana->id, 'status' => 'tarde']]])->assertStatus(422);

        // La App ve "injured" en estadísticas y en el detalle.
        $this->as($papa)->getJson("/api/app/children/{$ana->id}/stats")->assertOk()->assertJsonPath('data.attendance.injured', 1);
        $this->as($papa)->getJson("/api/app/children/{$ana->id}/events/{$id}")->assertJsonPath('data.attendance.status', 'injured');
    }

    public function test_borrador_sin_fecha_y_requisitos_para_publicar(): void
    {
        ['coach' => $coach, 'team' => $team, 'ana' => $ana] = $this->setupTeam();
        $id = $this->as($coach)->postJson($this->base.'/events', ['team_id' => $team->id, 'type' => 'match', 'starts_at' => null, 'publish' => false])
            ->assertCreated()->assertJsonPath('data.starts_at', null)->assertJsonPath('data.display_title', 'Sub-12 · Partido')->json('data.id');
        $this->as($coach)->patchJson($this->base."/events/{$id}", ['location' => 'Cancha 2', 'starts_at' => null])->assertOk();

        // Aparece en undated_drafts (con filtros) y no en el calendario.
        $this->as($coach)->getJson($this->base.'/events?undated_drafts=1&type=match')->assertJsonCount(1, 'data')->assertJsonPath('data.0.id', $id);
        $this->as($coach)->getJson($this->base.'/events?undated_drafts=1&type=training')->assertJsonCount(0, 'data');
        $this->as($coach)->getJson($this->base.'/events?undated_drafts=1&sport_id='.\App\Models\Sport::where('code', 'basketball')->value('id'))->assertJsonCount(0, 'data');
        $this->assertNotContains($id, collect($this->as($coach)->getJson($this->base.'/events')->json('data'))->pluck('id')->all());

        // Publicar sin fecha ni rival, y luego sin convocados.
        $this->as($coach)->postJson($this->base."/events/{$id}/publish")->assertStatus(422)->assertJsonPath('error.code', 'publish_incomplete')
            ->assertJsonStructure(['error' => ['fields' => ['starts_at', 'opponent_name']]]);
        $this->as($coach)->patchJson($this->base."/events/{$id}", ['starts_at' => now()->addDays(3)->toDateTimeString(), 'opponent_name' => 'Rival'])->assertOk();
        $this->as($coach)->postJson($this->base."/events/{$id}/publish")->assertStatus(422)->assertJsonPath('error.code', 'callups_required');
        $this->as($coach)->putJson($this->base."/events/{$id}/callups", ['players' => [['player_id' => $ana->id]]])->assertOk();
        $this->as($coach)->postJson($this->base."/events/{$id}/publish")->assertOk();

        // Publicado: no se le quita la fecha ni el rival.
        $this->as($coach)->patchJson($this->base."/events/{$id}", ['starts_at' => null])->assertStatus(422);
        $this->as($coach)->patchJson($this->base."/events/{$id}", ['opponent_name' => ''])->assertStatus(422);

        // POST con publish:true sin rival.
        $this->as($coach)->postJson($this->base.'/events', ['team_id' => $team->id, 'type' => 'match', 'starts_at' => now()->addDay()->toDateTimeString(), 'publish' => true, 'callups' => [['player_id' => $ana->id]]])
            ->assertStatus(422)->assertJsonPath('error.code', 'publish_incomplete');
        // Publicar un entreno sin fecha tampoco.
        $this->as($coach)->postJson($this->base.'/events', ['team_id' => $team->id, 'type' => 'training', 'publish' => true])
            ->assertStatus(422)->assertJsonPath('error.fields.starts_at.0', 'La fecha es obligatoria para publicar.');
    }

    public function test_borrar_publicado_exige_cancelar(): void
    {
        ['coach' => $coach, 'team' => $team, 'ana' => $ana] = $this->setupTeam();
        $mk = fn (bool $pub) => $this->as($coach)->postJson($this->base.'/events', ['team_id' => $team->id, 'type' => 'training', 'starts_at' => now()->addDay()->toDateTimeString(), 'publish' => $pub, 'callups' => [['player_id' => $ana->id]]])->json('data.id');
        $pub = $mk(true);
        $this->as($coach)->deleteJson($this->base."/events/{$pub}")->assertStatus(422)->assertJsonPath('error.code', 'event_must_cancel');
        $this->as($coach)->patchJson($this->base."/events/{$pub}", ['status' => 'cancelled'])->assertOk();
        $this->as($coach)->deleteJson($this->base."/events/{$pub}")->assertOk();
        $this->as($coach)->deleteJson($this->base.'/events/'.$mk(false))->assertOk();
    }

    public function test_errores_de_validacion_en_espanol(): void
    {
        ['coach' => $coach] = $this->setupTeam();
        $r = $this->as($coach)->postJson($this->base.'/events', ['type' => 'xx'])->assertStatus(422);
        $this->assertSame('El equipo es obligatorio.', $r->json('error.fields.team_id.0'));
        $this->assertStringNotContainsString('validation.', json_encode($r->json(), JSON_UNESCAPED_UNICODE));
    }

    public function test_hora_por_definir_en_borrador(): void
    {
        ['coach' => $coach, 'team' => $team, 'ana' => $ana] = $this->setupTeam();
        $day = now()->addDays(5)->toDateString();
        $id = $this->as($coach)->postJson($this->base.'/events', ['team_id' => $team->id, 'type' => 'match', 'starts_at' => $day, 'time_pending' => true,
            'opponent_name' => 'R', 'publish' => false, 'callups' => [['player_id' => $ana->id]]])
            ->assertCreated()->assertJsonPath('data.time_pending', true)->json('data.id');
        $this->as($coach)->getJson($this->base."/events/{$id}")->assertJsonPath('data.time_pending', true);
        $this->as($coach)->postJson($this->base."/events/{$id}/publish")->assertStatus(422)->assertJsonPath('error.code', 'publish_incomplete')
            ->assertJsonPath('error.fields.starts_at.0', 'La hora es obligatoria para publicar.');
        $this->as($coach)->postJson($this->base.'/events', ['team_id' => $team->id, 'type' => 'match', 'starts_at' => $day, 'time_pending' => true,
            'opponent_name' => 'R', 'publish' => true, 'callups' => [['player_id' => $ana->id]]])->assertStatus(422);
        $this->as($coach)->patchJson($this->base."/events/{$id}", ['starts_at' => $day.' 16:30', 'time_pending' => false])->assertOk();
        $this->as($coach)->postJson($this->base."/events/{$id}/publish")->assertOk()->assertJsonPath('data.time_pending', false);
        $this->as($coach)->patchJson($this->base."/events/{$id}", ['time_pending' => true])->assertStatus(422);
    }

    public function test_entrenos_recurrentes_con_un_aviso_por_padre(): void
    {
        ['coach' => $coach, 'team' => $team, 'ana' => $ana, 'beto' => $beto, 'papa' => $papa] = $this->setupTeam();
        // El papá tiene a los dos hijos convocados: recibe un solo aviso.
        \App\Models\GuardianPlayer::firstOrCreate(['user_id' => $papa->id, 'player_id' => $beto->id]);
        $from = now()->addDay()->startOfWeek()->addWeek(); // un lunes futuro
        $body = ['team_id' => $team->id, 'type' => 'training', 'from' => $from->toDateString(), 'until' => $from->copy()->addDays(20)->toDateString(),
            'weekdays' => [1, 3], 'time' => '17:30', 'location' => 'Cancha', 'callups' => [['player_id' => $ana->id], ['player_id' => $beto->id]], 'notify' => true];

        $r = $this->as($coach)->postJson($this->base.'/events/series', $body)->assertCreated()->assertJsonPath('data.count', 6);
        $sid = $r->json('data.series_id');
        $events = \App\Models\Event::where('series_id', $sid)->orderBy('starts_at')->get();
        $this->assertCount(6, $events);
        $this->assertSame('17:30', $events->first()->starts_at->format('H:i'));
        $this->assertSame(12, \App\Models\EventCallup::whereIn('event_id', $events->pluck('id'))->count());
        $this->assertFalse($events->contains(fn ($e) => $e->isDraft()));
        $n = UserNotification::where('user_id', $papa->id)->get();
        $this->assertCount(1, $n);
        $this->assertSame('trainings', $n[0]->kind);
        $this->assertStringStartsWith('Se programaron 6 entrenos de Sub-12: lunes y miércoles, 5:30 p. m., del ', $n[0]->body);
        $this->assertStringNotContainsString('Ana', $n[0]->body);

        // Repetir con la misma Idempotency-Key no duplica.
        $k = ['Idempotency-Key' => 'serie-1'];
        $a = $this->as($coach)->withHeaders($k)->postJson($this->base.'/events/series', ['weekdays' => [5]] + $body)->json('data.series_id');
        $b = $this->as($coach)->withHeaders($k)->postJson($this->base.'/events/series', ['weekdays' => [5]] + $body)->json('data.series_id');
        $this->assertSame($a, $b);
        $this->flushHeaders();

        // Límites.
        $this->as($coach)->postJson($this->base.'/events/series', ['callups' => []] + $body)->assertStatus(422);
        $this->as($coach)->postJson($this->base.'/events/series', ['until' => $from->copy()->addYears(2)->toDateString()] + $body)->assertStatus(422);
        $this->as($coach)->postJson($this->base.'/events/series', ['weekdays' => [1, 2, 3, 4, 5, 6, 7], 'until' => $from->copy()->addDays(300)->toDateString()] + $body)
            ->assertStatus(422)->assertJsonPath('error.code', 'series_too_large');
    }

    public function test_entreno_unico_con_notify_avisa_sin_nombres(): void
    {
        ['coach' => $coach, 'team' => $team, 'ana' => $ana, 'papa' => $papa] = $this->setupTeam();
        $at = now()->addDays(2)->setTime(7, 5);
        $this->as($coach)->postJson($this->base.'/events', ['team_id' => $team->id, 'type' => 'training', 'starts_at' => $at->toDateTimeString(),
            'publish' => true, 'notify' => true, 'callups' => [['player_id' => $ana->id]]])->assertCreated();
        $n = UserNotification::where('user_id', $papa->id)->sole();
        $this->assertSame('trainings', $n->kind);
        $this->assertSame('Se programó un entreno de Sub-12: '.$at->locale('es')->translatedFormat('l j \d\e F').', 7:05 a. m.', $n->body);
    }

    public function test_rango_de_120_dias(): void
    {
        ['coach' => $coach] = $this->setupTeam();
        $this->as($coach)->getJson($this->base.'/events?from=2026-01-01&to=2026-05-01')->assertOk();
        $this->as($coach)->getJson($this->base.'/events?from=2026-01-01&to=2026-05-02')->assertStatus(422)->assertJsonPath('error.code', 'range_too_large');
    }

    public function test_crear_publicado_con_convocatoria_avisa_y_valida_plantilla(): void
    {
        ['coach' => $coach, 'team' => $team, 'ana' => $ana, 'papa' => $papa] = $this->setupTeam();
        $base = ['team_id' => $team->id, 'type' => 'match', 'starts_at' => now()->addDays(2)->toDateTimeString(), 'opponent_name' => 'X'];
        $ajeno = $this->player($this->makeOrg('otra'), null, 'Zoe');
        $this->as($coach)->postJson($this->base.'/events', $base + ['callups' => [['player_id' => $ajeno->id]]])->assertStatus(422);
        $this->assertSame(0, \App\Models\Event::count());

        $this->as($coach)->postJson($this->base.'/events', $base + ['callups' => [['player_id' => $ana->id]]])
            ->assertCreated()->assertJsonPath('data.is_draft', false);
        $this->assertSame(1, UserNotification::where('user_id', $papa->id)->where('kind', 'callup')->count());
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
        $this->as($coach)->putJson($this->base."/events/{$id}/attendance", ['records' => [['player_id' => $beto->id, 'status' => 'injured']]])->assertOk();
        $this->as($coach)->getJson($this->base."/events/{$id}")->assertOk()->assertJsonCount(2, 'data.attendance');
    }

    public function test_penales_gol_en_contra_y_avisos(): void
    {
        ['coach' => $coach, 'team' => $team, 'ana' => $ana, 'beto' => $beto, 'papa' => $papa] = $this->setupTeam();
        $id = $this->as($coach)->postJson($this->base.'/events', ['team_id' => $team->id, 'type' => 'match', 'starts_at' => now()->subHours(3)->toDateTimeString(),
            'opponent_name' => 'Liceo Norte', 'publish' => true, 'callups' => [['player_id' => $ana->id]]])->json('data.id');
        $sheet = fn (array $extra) => $this->as($coach)->putJson($this->base."/events/{$id}/match-sheet", array_merge([
            'score_us' => 1, 'score_them' => 1, 'publish' => true, 'lineup' => [['player_id' => $ana->id], ['player_id' => $beto->id]],
            'actions' => [['stat_code' => 'goal', 'player_id' => $ana->id], ['stat_code' => 'goal_conceded', 'player_id' => $beto->id]],
        ], $extra));
        $kicks = [['player_id' => $ana->id, 'scored' => true], ['player_id' => $beto->id, 'scored' => false], ['player_id' => $ana->id, 'scored' => true]];

        // Validaciones.
        $sheet(['score_us' => 2, 'shootout' => ['score_us' => 2, 'score_them' => 1, 'kicks' => $kicks]])->assertStatus(422)->assertJsonPath('error.fields.shootout.0', 'Solo hay penales si el partido terminó empatado.');
        $sheet(['shootout' => ['score_us' => 3, 'score_them' => 1, 'kicks' => $kicks]])->assertStatus(422);
        $sheet(['shootout' => ['score_us' => 2, 'score_them' => 2, 'kicks' => $kicks]])->assertStatus(422);
        $ajeno = $this->player($this->makeOrg('otra'), null, 'Zoe');
        $sheet(['shootout' => ['score_us' => 1, 'score_them' => 0, 'kicks' => [['player_id' => $ajeno->id, 'scored' => true]]]])->assertStatus(422);

        // Válido: 1–1 (2–1 en penales). Gol en contra no suma al marcador ni da advertencia.
        $r = $sheet(['shootout' => ['score_us' => 2, 'score_them' => 1, 'kicks' => $kicks]])->assertOk()
            ->assertJsonPath('data.shootout.score_us', 2)->assertJsonPath('data.warnings', []);
        $this->assertCount(3, $r->json('data.shootout.kicks'));
        $this->assertSame('Sub-12 1–1 Liceo Norte (2–1 en penales). Ana: 1 gol.', UserNotification::where('user_id', $papa->id)->where('kind', 'match_result')->value('body'));
        $this->as($coach)->getJson($this->base.'/events?from='.now()->subDay()->toDateString())->assertJsonPath('data.0.shootout.score_them', 1);

        // App: marcador de penales sin los cobros ajenos; penales y gol en contra del hijo.
        $app = $this->as($papa)->getJson("/api/app/children/{$ana->id}/events/{$id}")->assertOk()
            ->assertJsonPath('data.shootout', ['score_us' => 2, 'score_them' => 1])->assertJsonPath('data.child_shootout', ['taken' => 2, 'scored' => 2])
            ->assertJsonPath('data.child_timeline.0.stat_code', 'goal')->assertJsonPath('data.child_timeline.0.type', 'stat');
        $this->as($papa)->getJson('/api/app/events?from='.now()->subDay()->toDateString())->assertJsonPath('data.0.shootout.score_us', 2);
        $this->as($papa)->getJson("/api/app/children/{$beto->id}/events/{$id}")->assertStatus(403);

        // Corregir solo los penales vuelve a avisar.
        $before = UserNotification::where('user_id', $papa->id)->where('kind', 'match_result')->count();
        $sheet(['shootout' => ['score_us' => 3, 'score_them' => 1, 'kicks' => array_merge($kicks, [['player_id' => $beto->id, 'scored' => true]])]])->assertOk();
        $this->assertSame($before + 1, UserNotification::where('user_id', $papa->id)->where('kind', 'match_result')->count());
        // null borra los penales.
        $sheet(['shootout' => null])->assertOk()->assertJsonPath('data.shootout', null);
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
        $this->assertStringContainsString('Sub-12 2–1 Colegio Rival', $n->body);
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
