<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PublicApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_health_responde_ok_en_json(): void
    {
        $this->getJson('/api/public/health')
            ->assertOk()
            ->assertJsonPath('status', 'ok')
            ->assertJsonPath('app', 'ppd');
    }

    public function test_encabezados_de_seguridad(): void
    {
        $r = $this->get('/api/public/health');
        $r->assertHeader('X-Content-Type-Options', 'nosniff');
        $r->assertHeader('X-Frame-Options', 'DENY');
        $r->assertHeader('Referrer-Policy', 'no-referrer');
        $this->assertStringContainsString("default-src 'none'", $r->headers->get('Content-Security-Policy'));
        $this->assertStringContainsString('no-store', $r->headers->get('Cache-Control'));
    }

    public function test_ruta_inexistente_devuelve_error_en_formato_ppd(): void
    {
        $this->get('/api/no-existe')
            ->assertNotFound()
            ->assertJsonPath('error.code', 'not_found');
    }

    public function test_cors_solo_dominios_propios(): void
    {
        $ok = $this->withHeaders(['Origin' => 'https://pc.ppdguate.com'])->getJson('/api/public/health');
        $ok->assertHeader('Access-Control-Allow-Origin', 'https://pc.ppdguate.com');

        $bad = $this->withHeaders(['Origin' => 'https://otro-sitio.com'])->getJson('/api/public/health');
        $this->assertNull($bad->headers->get('Access-Control-Allow-Origin'));
    }

    public function test_no_existen_rutas_de_archivos_locales(): void
    {
        $this->get('/storage/cualquier-cosa')->assertNotFound();
    }
}
