<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Catálogo inicial de deportes. Se puede editar después desde la API de super admin.
 * Es una migración (no un seeder) para que exista igual en producción y en pruebas.
 */
return new class extends Migration
{
    public function up(): void
    {
        $now = now();
        $sports = [
            ['futbol', 'Fútbol', 2, 45, 11, false,
                [['POR', 'Portero'], ['DEF', 'Defensa'], ['MED', 'Mediocampista'], ['DEL', 'Delantero']],
                [['goal', 'Gol', 1], ['own_goal', 'Autogol', 0], ['assist', 'Asistencia', 0], ['yellow_card', 'Tarjeta amarilla', 0], ['red_card', 'Tarjeta roja', 0], ['save', 'Atajada', 0]]],
            ['futbol_sala', 'Fútbol sala', 2, 20, 5, true,
                [['POR', 'Portero'], ['CIE', 'Cierre'], ['ALA', 'Ala'], ['PIV', 'Pívot']],
                [['goal', 'Gol', 1], ['own_goal', 'Autogol', 0], ['assist', 'Asistencia', 0], ['yellow_card', 'Tarjeta amarilla', 0], ['red_card', 'Tarjeta roja', 0], ['foul', 'Falta', 0]]],
            ['basquetbol', 'Básquetbol', 4, 10, 5, true,
                [['BAS', 'Base'], ['ESC', 'Escolta'], ['ALE', 'Alero'], ['ALP', 'Ala-pívot'], ['PIV', 'Pívot']],
                [['point_1', 'Tiro libre', 1], ['point_2', 'Doble', 2], ['point_3', 'Triple', 3], ['rebound', 'Rebote', 0], ['assist', 'Asistencia', 0], ['steal', 'Robo', 0], ['block', 'Tapón', 0], ['foul', 'Falta', 0]]],
            ['voleibol', 'Voleibol', 5, 0, 6, false,
                [['ARM', 'Armador'], ['OPU', 'Opuesto'], ['CEN', 'Central'], ['PUN', 'Punta'], ['LIB', 'Líbero']],
                [['point', 'Punto', 1], ['ace', 'Ace', 1], ['block', 'Bloqueo', 1], ['error', 'Error', 0]]],
            ['futbol_americano', 'Fútbol americano', 4, 12, 11, true,
                [['QB', 'Mariscal'], ['RB', 'Corredor'], ['WR', 'Receptor'], ['TE', 'Ala cerrada'], ['OL', 'Línea ofensiva'], ['DL', 'Línea defensiva'], ['LB', 'Apoyador'], ['DB', 'Defensivo profundo'], ['K', 'Pateador']],
                [['touchdown', 'Touchdown', 6], ['extra_point', 'Punto extra', 1], ['two_point', 'Conversión de 2', 2], ['field_goal', 'Gol de campo', 3], ['safety', 'Safety', 2], ['tackle', 'Tacleada', 0], ['interception', 'Intercepción', 0]]],
            ['beisbol', 'Béisbol', 9, 0, 9, false,
                [['P', 'Lanzador'], ['C', 'Receptor'], ['1B', 'Primera base'], ['2B', 'Segunda base'], ['3B', 'Tercera base'], ['SS', 'Campocorto'], ['LF', 'Jardín izquierdo'], ['CF', 'Jardín central'], ['RF', 'Jardín derecho']],
                [['run', 'Carrera', 1], ['hit', 'Hit', 0], ['home_run', 'Jonrón', 0], ['rbi', 'Carrera impulsada', 0], ['strikeout', 'Ponche', 0], ['walk', 'Base por bolas', 0]]],
        ];

        foreach ($sports as $i => [$code, $name, $periods, $minutes, $onField, $unlimited, $positions, $stats]) {
            $id = DB::table('sports')->insertGetId([
                'code' => $code, 'name' => $name, 'periods' => $periods, 'period_minutes' => $minutes,
                'max_on_field' => $onField, 'unlimited_substitutions' => $unlimited, 'active' => true,
                'sort' => $i, 'created_at' => $now, 'updated_at' => $now,
            ]);
            foreach ($positions as $j => [$pc, $pn]) {
                DB::table('sport_positions')->insert(['sport_id' => $id, 'code' => $pc, 'name' => $pn, 'sort' => $j, 'created_at' => $now, 'updated_at' => $now]);
            }
            foreach ($stats as $j => [$sc, $sn, $scores]) {
                DB::table('sport_stat_types')->insert(['sport_id' => $id, 'code' => $sc, 'name' => $sn, 'scores' => $scores, 'is_player_stat' => true, 'sort' => $j, 'created_at' => $now, 'updated_at' => $now]);
            }
        }
    }

    public function down(): void
    {
        DB::table('sports')->whereIn('code', ['futbol', 'futbol_sala', 'basquetbol', 'voleibol', 'futbol_americano', 'beisbol'])->delete();
    }
};
