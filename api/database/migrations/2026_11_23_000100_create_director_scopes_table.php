<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Alcance del director técnico: deportes completos y/o equipos sueltos (lo asigna el admin).
 * Los directores que ya existían reciben todos los deportes que su organización usa hoy (conservan lo que veían).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('director_scopes', function (Blueprint $table) {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('sport_id')->nullable()->constrained()->cascadeOnDelete();
            $table->foreignId('team_id')->nullable()->constrained()->cascadeOnDelete();
            $table->timestamps();
            $table->unique(['organization_id', 'user_id', 'sport_id', 'team_id'], 'director_scope_unique');
            $table->index(['organization_id', 'user_id']);
        });

        Schema::table('invitations', function (Blueprint $table) {
            $table->json('sport_ids')->nullable()->after('team_ids'); // alcance de un director invitado
        });

        $now = now();
        $directors = DB::table('organization_members')->where('role', 'director')->get(['organization_id', 'user_id']);
        foreach ($directors as $d) {
            $sports = DB::table('teams')->where('organization_id', $d->organization_id)->whereNull('deleted_at')->distinct()->pluck('sport_id');
            foreach ($sports as $sportId) {
                DB::table('director_scopes')->insertOrIgnore([
                    'organization_id' => $d->organization_id, 'user_id' => $d->user_id, 'sport_id' => $sportId,
                    'team_id' => null, 'created_at' => $now, 'updated_at' => $now,
                ]);
            }
        }
    }

    public function down(): void
    {
        Schema::table('invitations', function (Blueprint $table) {
            $table->dropColumn('sport_ids');
        });
        Schema::dropIfExists('director_scopes');
    }
};
