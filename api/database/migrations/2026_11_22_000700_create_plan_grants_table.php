<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('plan_grants', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();       // el padre
            $table->foreignId('organization_id')->nullable()->constrained()->nullOnDelete(); // cupo que consume (null = sin cupo)
            $table->string('plan', 10);                                          // pro | premium
            $table->foreignId('pro_player_id')->nullable()->constrained('players')->nullOnDelete();
            $table->timestamp('pro_player_changed_at')->nullable();
            $table->string('source', 12);                                        // super_admin | org_admin
            $table->foreignId('granted_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('starts_at')->useCurrent();
            $table->timestamp('ends_at')->nullable();
            $table->timestamp('revoked_at')->nullable();
            $table->string('note', 200)->nullable();
            $table->timestamps();
            $table->index(['user_id', 'revoked_at']);
            $table->index(['organization_id', 'plan', 'revoked_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('plan_grants');
    }
};
