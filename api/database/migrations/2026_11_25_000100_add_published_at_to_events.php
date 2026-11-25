<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Borradores de actividades: published_at NULL = borrador (no aparece en la App, no avisa a nadie).
 * Las actividades que ya existen quedan publicadas.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('events', function (Blueprint $table) {
            $table->timestamp('published_at')->nullable()->after('status');
            $table->index(['team_id', 'published_at']);
        });
        DB::table('events')->whereNull('published_at')->update(['published_at' => DB::raw('created_at')]);
    }

    public function down(): void
    {
        Schema::table('events', function (Blueprint $table) {
            $table->dropIndex(['team_id', 'published_at']);
            $table->dropColumn('published_at');
        });
    }
};
