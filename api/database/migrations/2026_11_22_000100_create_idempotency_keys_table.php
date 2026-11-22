<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('idempotency_keys', function (Blueprint $table) {
            $table->id();
            // "u:<user_id>" o "ip:<hash>" para peticiones sin sesión.
            $table->string('scope', 80);
            $table->string('idempotency_key', 128);
            $table->string('method', 10);
            $table->string('path', 255);
            $table->char('request_hash', 64);
            $table->string('status', 12)->default('processing'); // processing | completed
            $table->unsignedSmallInteger('response_code')->nullable();
            $table->longText('response_body')->nullable(); // cifrado
            $table->string('response_content_type', 100)->nullable();
            $table->timestamp('expires_at')->index();
            $table->timestamps();

            $table->unique(['scope', 'idempotency_key']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('idempotency_keys');
    }
};
