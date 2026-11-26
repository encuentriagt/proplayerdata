<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Avisos opcionales para staff (por ahora: "partido publicado").
 * Admin de organización: una fila con su organization_id. Super admin: organization_id NULL = todas.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('notification_subscriptions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('organization_id')->nullable()->constrained()->cascadeOnDelete();
            $table->string('kind', 40);
            $table->timestamps();
            $table->unique(['user_id', 'organization_id', 'kind']);
            $table->index(['kind', 'organization_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('notification_subscriptions');
    }
};
