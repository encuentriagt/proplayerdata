<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Evaluación del coach (radar 0–100) por jugador y deporte: actitud, velocidad, técnica, físico y táctica. */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('player_evaluations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->foreignId('player_id')->constrained()->cascadeOnDelete();
            $table->foreignId('sport_id')->constrained()->cascadeOnDelete();
            $table->json('attributes');
            $table->foreignId('evaluated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->unique(['player_id', 'sport_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('player_evaluations');
    }
};
