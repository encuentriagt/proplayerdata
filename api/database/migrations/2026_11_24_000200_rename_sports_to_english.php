<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Los deportes del catálogo se nombran en inglés (código y nombre). Es la única excepción a "textos en español":
 * posiciones, estadísticas y todo lo demás siguen en español. Equipos y alcances usan sport_id, no cambian.
 */
return new class extends Migration
{
    private const MAP = [
        // código anterior => [código nuevo, nombre nuevo, nombre anterior]
        'futbol' => ['soccer', 'Soccer', 'Fútbol'],
        'futbol_sala' => ['futsal', 'Futsal', 'Fútbol sala'],
        'basquetbol' => ['basketball', 'Basketball', 'Básquetbol'],
        'voleibol' => ['volleyball', 'Volleyball', 'Voleibol'],
        'futbol_americano' => ['american_football', 'American Football', 'Fútbol americano'],
        'beisbol' => ['baseball', 'Baseball', 'Béisbol'],
    ];

    public function up(): void
    {
        foreach (self::MAP as $old => [$code, $name]) {
            // Si el código nuevo ya existe (lo creó el super admin), no se toca para no violar el índice único.
            if (DB::table('sports')->where('code', $code)->exists()) {
                continue;
            }
            DB::table('sports')->where('code', $old)->update(['code' => $code, 'name' => $name, 'updated_at' => now()]);
        }
    }

    public function down(): void
    {
        foreach (self::MAP as $old => [$code, , $oldName]) {
            if (DB::table('sports')->where('code', $old)->exists()) {
                continue;
            }
            DB::table('sports')->where('code', $code)->update(['code' => $old, 'name' => $oldName, 'updated_at' => now()]);
        }
    }
};
