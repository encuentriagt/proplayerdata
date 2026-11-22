<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('events', function (Blueprint $table) {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->foreignId('team_id')->constrained()->cascadeOnDelete();
            $table->string('type', 10);                       // match | training | other
            $table->string('title', 150)->nullable();
            $table->dateTime('starts_at');                    // hora de Guatemala
            $table->dateTime('ends_at')->nullable();
            $table->string('location', 200)->nullable();
            $table->string('opponent_name', 120)->nullable();
            $table->string('home_away', 8)->nullable();       // home | away | neutral
            $table->string('status', 10)->default('scheduled'); // scheduled | finished | cancelled
            $table->unsignedSmallInteger('score_us')->nullable();
            $table->unsignedSmallInteger('score_them')->nullable();
            $table->timestamp('result_published_at')->nullable();
            $table->text('notes')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->softDeletes();
            $table->index(['team_id', 'starts_at']);
            $table->index(['organization_id', 'starts_at']);
        });

        Schema::create('event_callups', function (Blueprint $table) {
            $table->id();
            $table->foreignId('event_id')->constrained()->cascadeOnDelete();
            $table->foreignId('player_id')->constrained()->cascadeOnDelete();
            $table->string('status', 10)->default('called');            // called | reserve
            $table->string('guardian_response', 10)->default('pending'); // pending | confirmed | declined
            $table->foreignId('responded_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('responded_at')->nullable();
            $table->timestamps();
            $table->unique(['event_id', 'player_id']);
            $table->index('player_id');
        });

        Schema::create('attendances', function (Blueprint $table) {
            $table->id();
            $table->foreignId('event_id')->constrained()->cascadeOnDelete();
            $table->foreignId('player_id')->constrained()->cascadeOnDelete();
            $table->string('status', 10);                     // present | absent | late | excused
            $table->string('note', 200)->nullable();
            $table->foreignId('recorded_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->unique(['event_id', 'player_id']);
            $table->index('player_id');
        });

        // ---- Ficha del partido (se llena al final; no es en tiempo real) ----
        Schema::create('match_lineups', function (Blueprint $table) {
            $table->id();
            $table->foreignId('event_id')->constrained()->cascadeOnDelete();
            $table->foreignId('player_id')->constrained()->cascadeOnDelete();
            $table->boolean('is_starter')->default(false);
            $table->foreignId('sport_position_id')->nullable()->constrained()->nullOnDelete();
            $table->unsignedSmallInteger('jersey_number')->nullable();
            $table->unsignedSmallInteger('minutes_played')->nullable();
            $table->timestamps();
            $table->unique(['event_id', 'player_id']);
            $table->index('player_id');
        });

        Schema::create('match_actions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('event_id')->constrained()->cascadeOnDelete();
            $table->string('type', 10);                       // stat | sub_in | sub_out | note
            $table->foreignId('sport_stat_type_id')->nullable()->constrained()->restrictOnDelete();
            $table->foreignId('player_id')->nullable()->constrained()->cascadeOnDelete();
            $table->foreignId('related_player_id')->nullable()->constrained('players')->nullOnDelete();
            $table->unsignedTinyInteger('period')->nullable();
            $table->unsignedSmallInteger('minute')->nullable();
            $table->unsignedSmallInteger('value')->default(1);
            $table->string('note', 200)->nullable();
            $table->foreignId('recorded_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->index('event_id');
            $table->index('player_id');
        });

        Schema::create('player_event_stats', function (Blueprint $table) {
            $table->id();
            $table->foreignId('event_id')->constrained()->cascadeOnDelete();
            $table->foreignId('player_id')->constrained()->cascadeOnDelete();
            $table->unsignedSmallInteger('minutes_played')->nullable();
            $table->json('stats')->nullable();                // {"goal":2,"yellow_card":1}
            $table->timestamps();
            $table->unique(['event_id', 'player_id']);
            $table->index('player_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('player_event_stats');
        Schema::dropIfExists('match_actions');
        Schema::dropIfExists('match_lineups');
        Schema::dropIfExists('attendances');
        Schema::dropIfExists('event_callups');
        Schema::dropIfExists('events');
    }
};
