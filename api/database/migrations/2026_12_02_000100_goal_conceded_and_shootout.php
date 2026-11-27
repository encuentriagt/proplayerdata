<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * - Catálogo: "Gol en contra" (goal_conceded) para el portero en Soccer y Futsal. No suma al marcador.
 * - Penales del partido: marcador de la tanda y los cobros (quién cobró y si anotó).
 */
return new class extends Migration
{
    public function up(): void
    {
        $now = now();
        foreach (DB::table('sports')->whereIn('code', ['soccer', 'futsal'])->get() as $sport) {
            $exists = DB::table('sport_stat_types')->where('sport_id', $sport->id)->where('code', 'goal_conceded')->exists();
            if (! $exists) {
                DB::table('sport_stat_types')->insert([
                    'sport_id' => $sport->id, 'code' => 'goal_conceded', 'name' => 'Gol en contra', 'scores' => 0,
                    'is_player_stat' => true, 'sort' => (int) DB::table('sport_stat_types')->where('sport_id', $sport->id)->max('sort') + 1,
                    'created_at' => $now, 'updated_at' => $now,
                ]);
            }
        }

        Schema::table('events', function (Blueprint $table) {
            $table->unsignedTinyInteger('shootout_us')->nullable()->after('score_them');
            $table->unsignedTinyInteger('shootout_them')->nullable()->after('shootout_us');
            $table->json('shootout_kicks')->nullable()->after('shootout_them');
        });
    }

    public function down(): void
    {
        Schema::table('events', function (Blueprint $table) {
            $table->dropColumn(['shootout_us', 'shootout_them', 'shootout_kicks']);
        });
        DB::table('sport_stat_types')->where('code', 'goal_conceded')->delete();
    }
};
