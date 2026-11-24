<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Deportes activados por cada organización (el catálogo sigue siendo del super admin).
 * Al migrar se activan los deportes que la organización ya usa: los de sus equipos y los del alcance de sus directores.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('organization_sports', function (Blueprint $table) {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->foreignId('sport_id')->constrained()->cascadeOnDelete();
            $table->timestamps();
            $table->unique(['organization_id', 'sport_id']);
        });

        $now = now();
        $pairs = DB::table('teams')->whereNull('deleted_at')->select('organization_id', 'sport_id')
            ->union(DB::table('director_scopes')->whereNotNull('sport_id')->select('organization_id', 'sport_id'))
            ->get();
        foreach ($pairs as $p) {
            DB::table('organization_sports')->insertOrIgnore([
                'organization_id' => $p->organization_id, 'sport_id' => $p->sport_id,
                'created_at' => $now, 'updated_at' => $now,
            ]);
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('organization_sports');
    }
};
