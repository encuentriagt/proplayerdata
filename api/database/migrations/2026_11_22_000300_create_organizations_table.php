<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('organizations', function (Blueprint $table) {
            $table->id();
            $table->string('name', 150);
            $table->string('slug', 60)->unique();            // pc.ppdguate.com/<slug>
            $table->string('type', 10);                       // school | team
            $table->string('status', 12)->default('active');  // active | suspended
            // Marca blanca
            $table->string('logo_path')->nullable();
            $table->string('crest_path')->nullable();
            $table->string('cover_path')->nullable();
            $table->char('color_primary', 7)->default('#25984D');
            $table->char('color_secondary', 7)->default('#201E1D');
            $table->char('color_on_primary', 7)->default('#FFFFFF');
            $table->boolean('branding_editable_by_org')->default(false);
            // Cupos de planes para padres (los asigna el super admin)
            $table->unsignedInteger('quota_pro')->default(0);
            $table->unsignedInteger('quota_premium')->default(0);
            // Contacto
            $table->string('contact_email', 191)->nullable();
            $table->string('contact_phone', 30)->nullable();
            $table->text('notes')->nullable();
            $table->timestamps();
            $table->softDeletes();

            $table->index('status');
        });

        Schema::create('organization_members', function (Blueprint $table) {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('role', 12);                       // org_admin | director | coach
            $table->string('status', 12)->default('active');  // active | invited | disabled
            $table->timestamps();

            $table->unique(['organization_id', 'user_id', 'role']);
            $table->index(['user_id', 'status']);
        });

        Schema::create('invitations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->string('email', 191);
            $table->string('role', 12);                       // org_admin | director | coach | guardian
            $table->unsignedBigInteger('player_id')->nullable(); // FK cuando exista la tabla players
            $table->char('token_hash', 64)->unique();         // sha256 del token; el token nunca se guarda
            $table->timestamp('expires_at');
            $table->timestamp('accepted_at')->nullable();
            $table->foreignId('accepted_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('revoked_at')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index(['organization_id', 'email']);
        });

        Schema::create('audit_log', function (Blueprint $table) {
            $table->id();
            $table->foreignId('actor_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('organization_id')->nullable()->constrained()->nullOnDelete();
            $table->string('action', 64);
            $table->string('target_type', 64)->nullable();
            $table->unsignedBigInteger('target_id')->nullable();
            $table->json('data')->nullable();
            $table->string('ip', 45)->nullable();
            $table->string('user_agent', 255)->nullable();
            $table->timestamp('created_at')->useCurrent();

            $table->index(['organization_id', 'created_at']);
            $table->index(['target_type', 'target_id']);
            $table->index('action');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('audit_log');
        Schema::dropIfExists('invitations');
        Schema::dropIfExists('organization_members');
        Schema::dropIfExists('organizations');
    }
};
