<?php

namespace Tests\Feature;

use App\Models\DirectorScope;
use App\Models\OrganizationMember;
use App\Models\Sport;
use App\Models\TeamStaff;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Tests\Support\BuildsOrgs;
use Tests\TestCase;

/** Roles v1.4: admin todo; director técnico por alcance (deportes y/o equipos); coach solo lo asignado. */
class RolesTest extends TestCase
{
    use BuildsOrgs, RefreshDatabase;

    private string $base = '/api/pc/orgs/colegio-demo';

    private function escenario(): array
    {
        $org = $this->makeOrg();
        $futbol = Sport::where('code', 'futbol')->value('id');
        $basquet = Sport::where('code', 'basquetbol')->value('id');
        $voley = Sport::where('code', 'voleibol')->value('id');
        $f12 = $this->team($org, 'Fútbol Sub-12', 'futbol');
        $f15 = $this->team($org, 'Fútbol Sub-15', 'futbol');
        $bJ = $this->team($org, 'Básquet Juvenil', 'basquetbol');
        $vM = $this->team($org, 'Voleibol Mayor', 'voleibol');

        $admin = $this->member($org, 'admin@x.test', 'org_admin');
        $dtFutbol = $this->member($org, 'dt.futbol@x.test', 'director');
        DirectorScope::create(['organization_id' => $org->id, 'user_id' => $dtFutbol->id, 'sport_id' => $futbol]);
        $dtOtro = $this->member($org, 'dt.basquet@x.test', 'director');
        DirectorScope::create(['organization_id' => $org->id, 'user_id' => $dtOtro->id, 'sport_id' => $basquet]);
        DirectorScope::create(['organization_id' => $org->id, 'user_id' => $dtOtro->id, 'team_id' => $vM->id]); // un equipo suelto de otro deporte

        $coachF = $this->member($org, 'coach.f@x.test', 'coach');
        $this->assign($f12, $coachF);
        $coachF2 = $this->member($org, 'coach.f2@x.test', 'coach');
        $this->assign($f15, $coachF2);
        $coachB = $this->member($org, 'coach.b@x.test', 'coach');
        $this->assign($bJ, $coachB);

        return compact('org', 'futbol', 'basquet', 'voley', 'f12', 'f15', 'bJ', 'vM', 'admin', 'dtFutbol', 'dtOtro', 'coachF', 'coachF2', 'coachB');
    }

    private function names($r): array
    {
        return collect($r->json('data'))->pluck('name')->sort()->values()->all();
    }

    public function test_admin_ve_todo_incluidos_directores_y_su_alcance(): void
    {
        $e = $this->escenario();
        $this->assertCount(4, $this->as($e['admin'])->getJson($this->base.'/teams')->json('data'));
        $m = collect($this->as($e['admin'])->getJson($this->base.'/members')->assertOk()->json('data'));
        $this->assertCount(6, $m);
        $dt = $m->firstWhere('email', 'dt.basquet@x.test');
        $this->assertSame('Director técnico', $dt['role_label']);
        $this->assertSame(['Básquetbol'], collect($dt['director_scope']['sports'])->pluck('name')->all());
        $this->assertSame(['Voleibol Mayor'], collect($dt['director_scope']['teams'])->pluck('name')->all());
    }

    public function test_director_ve_solo_su_alcance_deportes_y_equipos_sueltos(): void
    {
        $e = $this->escenario();
        $this->assertSame(['Fútbol Sub-12', 'Fútbol Sub-15'], $this->names($this->as($e['dtFutbol'])->getJson($this->base.'/teams')));
        $this->assertSame([true], collect($this->as($e['dtFutbol'])->getJson($this->base.'/teams')->json('data'))->pluck('can_manage')->unique()->values()->all());
        $this->assertSame([false], collect($this->as($e['coachF'])->getJson($this->base.'/teams')->json('data'))->pluck('can_manage')->all());
        $this->assertSame(['Básquet Juvenil', 'Voleibol Mayor'], $this->names($this->as($e['dtOtro'])->getJson($this->base.'/teams')));
        $this->as($e['dtFutbol'])->getJson($this->base."/teams/{$e['bJ']->id}")->assertForbidden();

        // Un equipo nuevo de su deporte entra solo a su alcance.
        $nuevo = $this->team($e['org'], 'Fútbol Sub-10', 'futbol');
        $this->as($e['dtFutbol'])->getJson($this->base."/teams/{$nuevo->id}")->assertOk();
    }

    public function test_director_crea_y_maneja_equipos_solo_de_sus_deportes(): void
    {
        $e = $this->escenario();
        $this->as($e['dtFutbol'])->postJson($this->base.'/teams', ['name' => 'Fútbol Sub-8', 'sport_id' => $e['futbol']])->assertCreated();
        $this->as($e['dtFutbol'])->postJson($this->base.'/teams', ['name' => 'Básquet Sub-8', 'sport_id' => $e['basquet']])->assertForbidden();
        $this->as($e['dtFutbol'])->patchJson($this->base."/teams/{$e['f15']->id}", ['category' => 'Sub-15 A'])->assertOk();
        $this->as($e['dtFutbol'])->patchJson($this->base."/teams/{$e['bJ']->id}", ['category' => 'X'])->assertForbidden();
        // Con un equipo suelto (Voleibol Mayor) puede manejarlo, pero no crear equipos de voleibol.
        $this->as($e['dtOtro'])->patchJson($this->base."/teams/{$e['vM']->id}", ['category' => 'Mayor'])->assertOk();
        $this->as($e['dtOtro'])->postJson($this->base.'/teams', ['name' => 'Voleibol Sub-14', 'sport_id' => $e['voley']])->assertForbidden();
    }

    public function test_director_solo_ve_y_administra_coaches_de_su_alcance(): void
    {
        $e = $this->escenario();
        $m = collect($this->as($e['dtFutbol'])->getJson($this->base.'/members')->assertOk()->json('data'));
        $this->assertSame(['coach.f2@x.test', 'coach.f@x.test'], $m->pluck('email')->sort()->values()->all()); // ni admin, ni directores, ni coach de básquet

        $coachB = OrganizationMember::where('user_id', $e['coachB']->id)->first();
        $this->as($e['dtFutbol'])->patchJson($this->base."/members/{$coachB->id}", ['status' => 'disabled'])->assertForbidden();
        $otroDt = OrganizationMember::where('user_id', $e['dtOtro']->id)->first();
        $this->as($e['dtFutbol'])->patchJson($this->base."/members/{$otroDt->id}", ['status' => 'disabled'])->assertForbidden();
        $this->as($e['dtFutbol'])->postJson($this->base."/members/{$otroDt->id}/reset-password")->assertForbidden();

        $coachF2 = OrganizationMember::where('user_id', $e['coachF2']->id)->first();
        $this->as($e['dtFutbol'])->patchJson($this->base."/members/{$coachF2->id}", ['status' => 'disabled'])->assertOk();
    }

    public function test_director_asigna_coaches_a_sus_equipos(): void
    {
        $e = $this->escenario();
        // coachF2 (solo fútbol) puede ir a Sub-12; coachB (básquet) no lo administra el DT de fútbol.
        $this->as($e['dtFutbol'])->postJson($this->base."/teams/{$e['f12']->id}/staff", ['user_id' => $e['coachF2']->id])->assertCreated();
        $this->as($e['dtFutbol'])->postJson($this->base."/teams/{$e['f12']->id}/staff", ['user_id' => $e['coachB']->id])->assertStatus(422);
        $this->as($e['dtFutbol'])->postJson($this->base."/teams/{$e['f12']->id}/staff", ['user_id' => $e['dtOtro']->id])->assertStatus(422);
        $this->as($e['dtFutbol'])->postJson($this->base."/teams/{$e['bJ']->id}/staff", ['user_id' => $e['coachF']->id])->assertForbidden();
        $this->as($e['dtFutbol'])->deleteJson($this->base."/teams/{$e['f12']->id}/staff/{$e['coachF2']->id}")->assertOk();
    }

    public function test_invitaciones_por_rol(): void
    {
        Mail::fake();
        $e = $this->escenario();
        $this->as($e['dtFutbol'])->postJson($this->base.'/invitations', ['email' => 'nuevo.dt@x.test', 'role' => 'director', 'sport_ids' => [$e['futbol']]])->assertForbidden();
        $this->as($e['dtFutbol'])->postJson($this->base.'/invitations', ['email' => 'nuevo.admin@x.test', 'role' => 'org_admin'])->assertForbidden();
        $this->as($e['dtFutbol'])->postJson($this->base.'/invitations', ['email' => 'c1@x.test', 'role' => 'coach', 'team_ids' => [$e['bJ']->id]])->assertForbidden();
        $this->as($e['dtFutbol'])->postJson($this->base.'/invitations', ['email' => 'c1@x.test', 'role' => 'coach', 'team_ids' => [$e['f12']->id]])->assertCreated();
        $this->as($e['coachF'])->postJson($this->base.'/invitations', ['email' => 'c2@x.test', 'role' => 'coach'])->assertForbidden();

        // Admin invita un director con alcance; al aceptar queda su alcance y sus permisos.
        $this->as($e['admin'])->postJson($this->base.'/invitations', ['email' => 'dt.nuevo@x.test', 'role' => 'director'])->assertStatus(422);
        $url = $this->as($e['admin'])->postJson($this->base.'/invitations', [
            'email' => 'dt.nuevo@x.test', 'role' => 'director', 'sport_ids' => [$e['futbol'], $e['voley']], 'team_ids' => [$e['bJ']->id],
        ])->assertCreated()->json('data.invite_url');
        parse_str(parse_url($url, PHP_URL_QUERY), $q);
        $this->app['auth']->forgetGuards();
        $this->postJson("/api/public/invitations/{$q['token']}/accept", ['name' => 'DT Nuevo', 'password' => 'ClaveDt2026xx', 'password_confirmation' => 'ClaveDt2026xx'])->assertOk();
        $login = $this->withHeaders(['X-App-Platform' => 'web'])->postJson('/api/auth/login', ['email' => 'dt.nuevo@x.test', 'password' => 'ClaveDt2026xx'])->assertOk();
        $perm = $login->json('data.memberships.0.permissions');
        $this->assertSame(['coach', 'guardian'], $perm['invite_roles']);
        $this->assertEqualsCanonicalizing([$e['futbol'], $e['voley']], $perm['create_teams']);
        $this->assertSame([$e['bJ']->id], $perm['director_scope']['team_ids']);
    }

    public function test_admin_cambia_el_alcance_del_director(): void
    {
        $e = $this->escenario();
        $dt = OrganizationMember::where('user_id', $e['dtFutbol']->id)->first();
        $this->as($e['dtOtro'])->putJson($this->base."/members/{$dt->id}/scopes", ['sport_ids' => [], 'team_ids' => []])->assertForbidden();
        $this->as($e['admin'])->putJson($this->base."/members/{$dt->id}/scopes", ['sport_ids' => [$e['basquet']], 'team_ids' => [$e['f12']->id]])
            ->assertOk()->assertJsonPath('data.director_scope.sports.0.name', 'Básquetbol');
        $this->assertSame(['Básquet Juvenil', 'Fútbol Sub-12'], $this->names($this->as($e['dtFutbol'])->getJson($this->base.'/teams')));
        $coach = OrganizationMember::where('user_id', $e['coachF']->id)->first();
        $this->as($e['admin'])->putJson($this->base."/members/{$coach->id}/scopes", ['sport_ids' => [], 'team_ids' => []])->assertStatus(422);
    }

    public function test_coach_solo_lo_asignado_sin_ver_otros_coaches(): void
    {
        $e = $this->escenario();
        TeamStaff::create(['team_id' => $e['f12']->id, 'user_id' => $e['coachF2']->id, 'role' => 'assistant']);

        $this->assertSame(['Fútbol Sub-12'], $this->names($this->as($e['coachF'])->getJson($this->base.'/teams')));
        $staff = $this->as($e['coachF'])->getJson($this->base."/teams/{$e['f12']->id}")->assertOk()->assertJsonPath('data.can_manage', false)->json('data.staff');
        $this->assertSame([$e['coachF']->id], collect($staff)->pluck('user_id')->all());
        $this->as($e['coachF'])->getJson($this->base.'/members')->assertForbidden();
        $this->as($e['coachF'])->postJson($this->base.'/teams', ['name' => 'Fútbol Sub-9', 'sport_id' => $e['futbol']])->assertForbidden();
        $this->as($e['coachF'])->patchJson($this->base."/teams/{$e['f12']->id}", ['category' => 'X'])->assertForbidden();
        $this->as($e['coachF'])->postJson($this->base."/teams/{$e['f12']->id}/staff", ['user_id' => $e['coachF2']->id])->assertForbidden();

        // Enrola (registrando nuevo) y desenrola jugadores de su equipo.
        $id = $this->as($e['coachF'])->postJson($this->base.'/players', ['first_name' => 'Nuevo', 'last_name' => 'Jugador', 'team_id' => $e['f12']->id])->assertCreated()->json('data.id');
        $this->as($e['coachF'])->deleteJson($this->base."/teams/{$e['f12']->id}/roster/{$id}")->assertOk();
        $this->as($e['coachF'])->postJson($this->base."/teams/{$e['f12']->id}/roster", ['player_id' => $id])->assertStatus(403); // ya no lo ve
    }

    public function test_endpoint_de_permisos(): void
    {
        $e = $this->escenario();
        $this->as($e['coachF'])->getJson($this->base.'/access')->assertOk()
            ->assertJsonPath('data.roles', ['coach'])
            ->assertJsonPath('data.permissions.invite_roles', ['guardian'])
            ->assertJsonPath('data.permissions.manage_members', false)
            ->assertJsonPath('data.permissions.create_teams', [])
            ->assertJsonPath('data.permissions.create_players_without_team', false);
        $this->as($e['admin'])->getJson($this->base.'/access')->assertJsonPath('data.permissions.create_teams', 'all')
            ->assertJsonPath('data.permissions.manage_directors', true);
    }
}
