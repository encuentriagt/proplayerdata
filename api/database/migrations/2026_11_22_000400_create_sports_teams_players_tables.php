<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // ---- Catálogo multideporte (lo administra el super admin) ----
        Schema::create('sports', function (Blueprint $table) {
            $table->id();
            $table->string('code', 30)->unique();          // futbol, basquetbol...
            $table->string('name', 60);
            $table->unsignedTinyInteger('periods')->default(2);
            $table->unsignedSmallInteger('period_minutes')->default(45);
            $table->unsignedTinyInteger('max_on_field')->nullable();
            $table->boolean('unlimited_substitutions')->default(false);
            $table->boolean('active')->default(true);
            $table->unsignedSmallInteger('sort')->default(0);
            $table->timestamps();
        });

        Schema::create('sport_positions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('sport_id')->constrained()->cascadeOnDelete();
            $table->string('code', 12);
            $table->string('name', 60);
            $table->unsignedSmallInteger('sort')->default(0);
            $table->timestamps();
            $table->unique(['sport_id', 'code']);
        });

        Schema::create('sport_stat_types', function (Blueprint $table) {
            $table->id();
            $table->foreignId('sport_id')->constrained()->cascadeOnDelete();
            $table->string('code', 30);                      // goal, assist, yellow_card, point_2...
            $table->string('name', 60);
            $table->unsignedTinyInteger('scores')->default(0); // cuánto suma al marcador
            $table->boolean('is_player_stat')->default(true);
            $table->unsignedSmallInteger('sort')->default(0);
            $table->timestamps();
            $table->unique(['sport_id', 'code']);
        });

        // ---- Temporadas y equipos ----
        Schema::create('seasons', function (Blueprint $table) {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->string('name', 60);
            $table->date('starts_on')->nullable();
            $table->date('ends_on')->nullable();
            $table->boolean('is_current')->default(false);
            $table->timestamps();
            $table->index(['organization_id', 'is_current']);
        });

        Schema::create('teams', function (Blueprint $table) {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->foreignId('sport_id')->constrained()->restrictOnDelete();
            $table->foreignId('season_id')->nullable()->constrained()->nullOnDelete();
            $table->string('name', 100);
            $table->string('category', 60)->nullable();   // Sub-12, Juvenil...
            $table->string('gender', 10)->nullable();     // male | female | mixed
            $table->char('color', 7)->nullable();
            $table->timestamps();
            $table->softDeletes();
            $table->index(['organization_id', 'sport_id']);
        });

        Schema::create('team_staff', function (Blueprint $table) {
            $table->id();
            $table->foreignId('team_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('role', 12)->default('head_coach'); // head_coach | assistant
            $table->timestamps();
            $table->unique(['team_id', 'user_id']);
            $table->index('user_id');
        });

        // ---- Jugadores (menores de edad: datos mínimos) ----
        Schema::create('players', function (Blueprint $table) {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->string('first_name', 80);
            $table->string('last_name', 80);
            $table->date('birthdate')->nullable();
            $table->string('gender', 10)->nullable();
            $table->string('photo_path')->nullable();      // privado
            $table->text('document_number')->nullable();   // cifrado
            $table->text('notes')->nullable();             // cifrado
            $table->timestamps();
            $table->softDeletes();
            $table->index(['organization_id', 'last_name']);
        });

        Schema::create('team_players', function (Blueprint $table) {
            $table->id();
            $table->foreignId('team_id')->constrained()->cascadeOnDelete();
            $table->foreignId('player_id')->constrained()->cascadeOnDelete();
            $table->unsignedSmallInteger('jersey_number')->nullable();
            $table->foreignId('sport_position_id')->nullable()->constrained()->nullOnDelete();
            $table->boolean('active')->default(true);
            $table->timestamps();
            $table->unique(['team_id', 'player_id']);
            $table->index('player_id');
        });

        Schema::create('guardian_players', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('player_id')->constrained()->cascadeOnDelete();
            $table->string('relationship', 20)->nullable(); // madre, padre, encargado...
            $table->timestamp('verified_at')->nullable();
            $table->timestamps();
            $table->unique(['user_id', 'player_id']);
            $table->index('player_id');
        });

        Schema::table('invitations', function (Blueprint $table) {
            $table->foreign('player_id')->references('id')->on('players')->cascadeOnDelete();
            $table->json('team_ids')->nullable()->after('player_id'); // equipos a asignar a un coach
        });
    }

    public function down(): void
    {
        Schema::table('invitations', function (Blueprint $table) {
            $table->dropForeign(['player_id']);
            $table->dropColumn('team_ids');
        });
        Schema::dropIfExists('guardian_players');
        Schema::dropIfExists('team_players');
        Schema::dropIfExists('players');
        Schema::dropIfExists('team_staff');
        Schema::dropIfExists('teams');
        Schema::dropIfExists('seasons');
        Schema::dropIfExists('sport_stat_types');
        Schema::dropIfExists('sport_positions');
        Schema::dropIfExists('sports');
    }
};
