<?php

namespace Tests\Feature;

use App\Models\Organization;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Support\BuildsOrgs;
use Tests\TestCase;

/** Buscador público de instituciones (pantalla de inicio de la PC). */
class OrgSearchTest extends TestCase
{
    use BuildsOrgs, RefreshDatabase;

    private function org(string $name, string $slug, string $status = 'active'): Organization
    {
        return Organization::create(['name' => $name, 'slug' => $slug, 'type' => 'school', 'status' => $status,
            'color_primary' => '#123456', 'contact_email' => 'secreto@x.test', 'quota_pro' => 9]);
    }

    public function test_busca_sin_mayusculas_ni_tildes_y_no_expone_datos_internos(): void
    {
        $this->org('Colegio Americano', 'americano');
        $this->org('Liceo Guatemala', 'liceo-gt');
        $this->org('Escuela Pública Ñandú', 'nandu');
        $this->org('Colegio Cerrado', 'cerrado', 'suspended');

        $r = $this->getJson('/api/public/orgs?search=COLE')->assertOk();
        $this->assertSame(['Colegio Americano'], collect($r->json('data'))->pluck('name')->all());
        $this->assertSame(['name', 'slug', 'logo_url', 'crest_url', 'colors'], array_keys($r->json('data.0')));
        $this->assertSame(['primary', 'secondary', 'on_primary'], array_keys($r->json('data.0.colors')));
        $this->assertSame('#123456', $r->json('data.0.colors.primary'));
        $this->assertStringNotContainsString('secreto', $r->getContent());

        $this->getJson('/api/public/orgs?search=publica')->assertJsonPath('data.0.slug', 'nandu');
        $this->getJson('/api/public/orgs?search=ñan')->assertJsonPath('data.0.slug', 'nandu');
        $this->getJson('/api/public/orgs?search=liceo-g')->assertJsonPath('data.0.slug', 'liceo-gt');
        $this->getJson('/api/public/orgs?search=zzz')->assertOk()->assertExactJson(['data' => []]);
        $this->getJson('/api/public/orgs?search=%25%25')->assertOk()->assertJsonCount(0, 'data');
        $this->getJson('/api/public/orgs?search=a')->assertStatus(422);
        $this->getJson('/api/public/orgs')->assertStatus(422);

        // Al renombrar, el buscador se actualiza.
        Organization::where('slug', 'liceo-gt')->first()->update(['name' => 'Instituto Quetzal']);
        $this->getJson('/api/public/orgs?search=quetzal')->assertJsonCount(1, 'data');
    }

    public function test_maximo_diez_y_primero_los_que_empiezan_con_el_texto(): void
    {
        for ($i = 1; $i <= 12; $i++) {
            $this->org("Academia Fútbol {$i}", "academia-{$i}");
        }
        $this->org('Futbol Club', 'futbol-club');
        $r = $this->getJson('/api/public/orgs?search=futbol')->assertOk()->assertJsonCount(10, 'data');
        $this->assertSame('futbol-club', $r->json('data.0.slug'));
    }

    public function test_limite_por_ip(): void
    {
        $this->org('Colegio Americano', 'americano');
        for ($i = 0; $i < 30; $i++) {
            $this->getJson('/api/public/orgs?search=co')->assertOk();
        }
        $this->getJson('/api/public/orgs?search=co')->assertStatus(429)->assertJsonPath('error.code', 'too_many_requests');
    }
}
