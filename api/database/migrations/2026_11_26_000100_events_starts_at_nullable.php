<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Los borradores pueden no tener fecha todavía. Para publicar sí se exige (ver EventController::publishProblems). */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('events', function (Blueprint $table) {
            $table->dateTime('starts_at')->nullable()->change();
        });
    }

    public function down(): void
    {
        // Solo se puede volver atrás si no quedan borradores sin fecha.
        Schema::table('events', function (Blueprint $table) {
            $table->dateTime('starts_at')->nullable(false)->change();
        });
    }
};
