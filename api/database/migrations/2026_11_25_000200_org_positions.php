<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Posiciones por organización: sport_positions.organization_id NULL = catálogo de ppd; con valor = lista del colegio.
 * Cada organización recibe una copia del catálogo de sus deportes activados y se remapean plantillas y fichas a las copias.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('sport_positions', function (Blueprint $table) {
            $table->foreignId('organization_id')->nullable()->after('sport_id')->constrained()->cascadeOnDelete();
            $table->softDeletes();
            $table->index(['organization_id', 'sport_id']);
            // La llave foránea de sport_id necesita su propio índice al quitar el único (sport_id, code) en MariaDB.
            $table->index('sport_id', 'sport_positions_sport_id_idx');
        });
        // La unicidad del código pasa a ser por organización y deporte (el catálogo se valida en el Panel).
        Schema::table('sport_positions', function (Blueprint $table) {
            $table->dropUnique(['sport_id', 'code']);
            $table->unique(['organization_id', 'sport_id', 'code']);
        });

        $now = now();
        foreach (DB::table('organization_sports')->get() as $os) {
            $map = [];
            foreach (DB::table('sport_positions')->whereNull('organization_id')->where('sport_id', $os->sport_id)->orderBy('sort')->get() as $p) {
                $map[$p->id] = DB::table('sport_positions')->insertGetId([
                    'sport_id' => $p->sport_id, 'organization_id' => $os->organization_id, 'code' => $p->code,
                    'name' => $p->name, 'sort' => $p->sort, 'created_at' => $now, 'updated_at' => $now,
                ]);
            }
            $teamIds = DB::table('teams')->where('organization_id', $os->organization_id)->where('sport_id', $os->sport_id)->pluck('id');
            $eventIds = DB::table('events')->whereIn('team_id', $teamIds)->pluck('id');
            foreach ($map as $old => $new) {
                DB::table('team_players')->whereIn('team_id', $teamIds)->where('sport_position_id', $old)->update(['sport_position_id' => $new]);
                DB::table('match_lineups')->whereIn('event_id', $eventIds)->where('sport_position_id', $old)->update(['sport_position_id' => $new]);
            }
        }
    }

    public function down(): void
    {
        // Vuelve a apuntar a las posiciones del catálogo (por código) antes de borrar las copias.
        foreach (DB::table('sport_positions')->whereNotNull('organization_id')->get() as $p) {
            $cat = DB::table('sport_positions')->whereNull('organization_id')->where('sport_id', $p->sport_id)->where('code', $p->code)->value('id');
            DB::table('team_players')->where('sport_position_id', $p->id)->update(['sport_position_id' => $cat]);
            DB::table('match_lineups')->where('sport_position_id', $p->id)->update(['sport_position_id' => $cat]);
        }
        DB::table('sport_positions')->whereNotNull('organization_id')->delete();
        Schema::table('sport_positions', function (Blueprint $table) {
            $table->dropUnique(['organization_id', 'sport_id', 'code']);
            $table->unique(['sport_id', 'code']);
        });
        Schema::table('sport_positions', function (Blueprint $table) {
            $table->dropIndex(['organization_id', 'sport_id']);
            $table->dropIndex('sport_positions_sport_id_idx');
            $table->dropSoftDeletes();
            $table->dropConstrainedForeignId('organization_id');
        });
    }
};
