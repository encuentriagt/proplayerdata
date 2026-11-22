<?php

namespace Tests\Feature;

use App\Models\IdempotencyKey;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Route;
use Tests\TestCase;

class IdempotencyTest extends TestCase
{
    use RefreshDatabase;

    private int $calls = 0;

    protected function setUp(): void
    {
        parent::setUp();
        $this->calls = 0;

        Route::middleware(['api', 'idempotent'])->post('/api/_test/crear', function () {
            $this->calls++;

            return response()->json(['creado' => $this->calls], 201);
        });
        Route::middleware(['api', 'idempotent:required'])->post('/api/_test/obligatorio', fn () => response()->json(['ok' => true]));
        Route::middleware(['api', 'idempotent'])->post('/api/_test/falla', fn () => response()->json(['x' => 1], 500));
    }

    public function test_misma_clave_y_mismos_datos_no_repite_el_efecto(): void
    {
        $h = ['Idempotency-Key' => 'clave-prueba-0001'];

        $a = $this->postJson('/api/_test/crear', ['n' => 1], $h)->assertCreated()->assertJsonPath('creado', 1);
        $b = $this->postJson('/api/_test/crear', ['n' => 1], $h)->assertCreated()->assertJsonPath('creado', 1);

        $this->assertSame(1, $this->calls);
        $b->assertHeader('Idempotency-Replayed', 'true');
        $this->assertNull($a->headers->get('Idempotency-Replayed'));
    }

    public function test_misma_clave_con_datos_distintos_es_rechazada(): void
    {
        $h = ['Idempotency-Key' => 'clave-prueba-0002'];
        $this->postJson('/api/_test/crear', ['n' => 1], $h)->assertCreated();
        $this->postJson('/api/_test/crear', ['n' => 2], $h)
            ->assertStatus(422)->assertJsonPath('error.code', 'idempotency_key_reused');
        $this->assertSame(1, $this->calls);
    }

    public function test_orden_de_campos_no_cambia_la_huella(): void
    {
        $h = ['Idempotency-Key' => 'clave-prueba-0003'];
        $this->postJson('/api/_test/crear', ['a' => 1, 'b' => ['y' => 2, 'x' => 1]], $h)->assertCreated();
        $this->postJson('/api/_test/crear', ['b' => ['x' => 1, 'y' => 2], 'a' => 1], $h)->assertCreated();
        $this->assertSame(1, $this->calls);
    }

    public function test_sin_clave_funciona_normal_si_es_opcional(): void
    {
        $this->postJson('/api/_test/crear', ['n' => 1])->assertCreated();
        $this->postJson('/api/_test/crear', ['n' => 1])->assertCreated();
        $this->assertSame(2, $this->calls);
    }

    public function test_clave_obligatoria(): void
    {
        $this->postJson('/api/_test/obligatorio', [])
            ->assertStatus(428)->assertJsonPath('error.code', 'idempotency_key_required');
        $this->postJson('/api/_test/obligatorio', [], ['Idempotency-Key' => 'clave-prueba-0004'])->assertOk();
    }

    public function test_clave_invalida(): void
    {
        $this->postJson('/api/_test/crear', [], ['Idempotency-Key' => 'x y'])
            ->assertStatus(422)->assertJsonPath('error.code', 'idempotency_key_invalid');
    }

    public function test_error_500_no_se_guarda_y_permite_reintentar(): void
    {
        $this->postJson('/api/_test/falla', [], ['Idempotency-Key' => 'clave-prueba-0005'])->assertStatus(500);
        $this->assertSame(0, IdempotencyKey::count());
    }

    public function test_respuesta_guardada_va_cifrada(): void
    {
        $this->postJson('/api/_test/crear', ['n' => 9], ['Idempotency-Key' => 'clave-prueba-0006'])->assertCreated();
        $raw = \DB::table('idempotency_keys')->value('response_body');
        $this->assertStringNotContainsString('creado', $raw);
    }
}
