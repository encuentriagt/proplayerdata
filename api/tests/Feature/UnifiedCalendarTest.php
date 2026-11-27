<?php

namespace Tests\Feature;

use App\Models\Event;
use App\Models\EventCallup;
use App\Models\GuardianPlayer;
use App\Models\Sport;
use App\Models\UserNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Support\BuildsOrgs;
use Tests\TestCase;

/** Calendario unificado de todos los hijos y avisos con colegio, hijo y deporte. */
class UnifiedCalendarTest extends TestCase
{
    use BuildsOrgs, RefreshDatabase;

    public function test_un_calendario_para_hijos_de_dos_colegios_y_un_evento_compartido(): void
    {
        $a = $this->makeOrg();
        $b = $this->makeOrg('otra');
        $fa = $this->team($a, 'Sub-12', 'soccer');
        $ba = $this->team($a, 'Básquet', 'basketball');
        $fb = $this->team($b, 'Juvenil', 'baseball');
        $ana = $this->player($a, $fa, 'Ana');
        $beto = $this->player($a, $fa, 'Beto');   // mismo equipo que Ana
        $luis = $this->player($b, $fb, 'Luis');
        \App\Models\TeamPlayer::create(['team_id' => $ba->id, 'player_id' => $ana->id, 'active' => true]);
        $papa = $this->guardian('papa@x.test');
        foreach ([$ana, $beto, $luis] as $p) {
            GuardianPlayer::create(['user_id' => $papa->id, 'player_id' => $p->id]);
        }
        $mk = fn ($team, $type, $days, $pub = true) => Event::create(['organization_id' => $team->organization_id, 'team_id' => $team->id, 'type' => $type,
            'title' => null, 'opponent_name' => 'R', 'starts_at' => now()->addDays($days), 'status' => 'scheduled', 'published_at' => $pub ? now() : null]);
        $m1 = $mk($fa, 'match', 1);
        $mk($ba, 'training', 2);
        $mk($fb, 'match', 3);
        $mk($fa, 'match', 4, false); // borrador: no aparece
        EventCallup::create(['event_id' => $m1->id, 'player_id' => $ana->id, 'status' => 'called']);

        $r = $this->as($papa)->getJson('/api/app/events?from='.now()->toDateString())->assertOk()->assertJsonCount(3, 'data');
        $first = $r->json('data.0');
        $this->assertSame($m1->id, $first['id']);
        $this->assertEqualsCanonicalizing([$ana->id, $beto->id], $first['child_ids']);
        $this->assertSame(['id' => $a->id, 'name' => $a->name], $first['organization']);
        $this->assertSame('soccer', $first['sport']['code']);
        $this->assertSame('called', collect($first['children'])->firstWhere('child_id', $ana->id)['callup']['status']);
        $this->assertNull(collect($first['children'])->firstWhere('child_id', $beto->id)['callup']);
        $this->assertArrayNotHasKey('notes', $first);

        // Filtros.
        $this->as($papa)->getJson('/api/app/events?child_id='.$luis->id)->assertJsonCount(1, 'data')->assertJsonPath('data.0.organization.id', $b->id);
        $this->as($papa)->getJson('/api/app/events?type=training')->assertJsonCount(1, 'data');
        $this->as($papa)->getJson('/api/app/events?sport_id='.Sport::where('code', 'baseball')->value('id'))->assertJsonCount(1, 'data');
        $this->as($papa)->getJson("/api/app/children/{$ana->id}/events?type=match")->assertJsonCount(1, 'data');
        $this->as($papa)->getJson("/api/app/children/{$ana->id}/events?sport_id=".Sport::where('code', 'basketball')->value('id'))->assertJsonCount(1, 'data');
        // Hijo ajeno.
        $otro = $this->player($a, $fa, 'Zoe');
        $this->as($papa)->getJson('/api/app/events?child_id='.$otro->id)->assertForbidden();
    }

    public function test_un_solo_aviso_si_dos_hijos_son_convocados_y_datos_del_aviso(): void
    {
        $a = $this->makeOrg();
        $t = $this->team($a, 'Sub-12', 'soccer');
        $coach = $this->member($a, 'c@x.test', 'coach');
        $this->assign($t, $coach);
        $ana = $this->player($a, $t, 'Ana');
        $beto = $this->player($a, $t, 'Beto');
        $papa = $this->guardian('papa@x.test');
        $mama = $this->guardian('mama@x.test');
        GuardianPlayer::create(['user_id' => $papa->id, 'player_id' => $ana->id]);
        GuardianPlayer::create(['user_id' => $papa->id, 'player_id' => $beto->id]);
        GuardianPlayer::create(['user_id' => $mama->id, 'player_id' => $beto->id]);

        $this->as($coach)->postJson('/api/pc/orgs/colegio-demo/events', ['team_id' => $t->id, 'type' => 'match', 'starts_at' => now()->addDays(2)->toDateTimeString(),
            'opponent_name' => 'Rival', 'publish' => true, 'callups' => [['player_id' => $ana->id], ['player_id' => $beto->id]]])->assertCreated();

        $n = UserNotification::where('user_id', $papa->id)->sole();
        $this->assertStringStartsWith('Ana y Beto fueron convocados para Sub-12 vs Rival', $n->body);
        $d = (array) $n->data;
        $this->assertSame([(string) $a->id, $a->name, 'soccer', 'Ana y Beto'], [$d['organization_id'], $d['organization_name'], $d['sport_code'], $d['child_name']]);
        $m = UserNotification::where('user_id', $mama->id)->sole();
        $this->assertStringStartsWith('Beto fue convocado(a)', $m->body);
        $this->assertSame((string) $beto->id, ((array) $m->data)['player_id']);
    }
}
