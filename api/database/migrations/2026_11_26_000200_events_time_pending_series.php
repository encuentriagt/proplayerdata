<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** time_pending: borrador con fecha pero hora por definir. series_id: entrenos creados juntos (POST events/series). */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('events', function (Blueprint $table) {
            $table->boolean('time_pending')->default(false)->after('starts_at');
            $table->uuid('series_id')->nullable()->after('team_id')->index();
        });
    }

    public function down(): void
    {
        Schema::table('events', function (Blueprint $table) {
            $table->dropIndex(['series_id']);
            $table->dropColumn(['time_pending', 'series_id']);
        });
    }
};
