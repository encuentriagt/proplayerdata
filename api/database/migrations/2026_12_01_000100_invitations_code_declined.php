<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Vínculo padre-hijo desde la App: código corto para escribir a mano (solo invitaciones de padre) y rechazo. */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('invitations', function (Blueprint $table) {
            $table->string('code', 12)->nullable()->unique()->after('token_hash');
            $table->timestamp('declined_at')->nullable()->after('revoked_at');
        });
    }

    public function down(): void
    {
        Schema::table('invitations', function (Blueprint $table) {
            $table->dropUnique(['code']);
            $table->dropColumn(['code', 'declined_at']);
        });
    }
};
