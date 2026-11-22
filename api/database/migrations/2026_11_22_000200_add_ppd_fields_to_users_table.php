<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('phone', 30)->nullable()->after('email');
            $table->string('status', 12)->default('active')->after('phone'); // active | disabled
            $table->boolean('is_super_admin')->default(false)->after('status');
            $table->boolean('must_change_password')->default(false)->after('password');
            $table->text('totp_secret')->nullable()->after('must_change_password'); // cifrado
            $table->timestamp('totp_confirmed_at')->nullable()->after('totp_secret');
            $table->string('google_sub', 191)->nullable()->unique()->after('totp_confirmed_at');
            $table->string('apple_sub', 191)->nullable()->unique()->after('google_sub');
            $table->text('apple_refresh_token')->nullable()->after('apple_sub'); // cifrado
            $table->unsignedSmallInteger('failed_logins')->default(0)->after('apple_refresh_token');
            $table->timestamp('locked_until')->nullable()->after('failed_logins');
            $table->timestamp('last_login_at')->nullable()->after('locked_until');
            $table->softDeletes();
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropUnique(['google_sub']);
            $table->dropUnique(['apple_sub']);
            $table->dropSoftDeletes();
            $table->dropColumn([
                'phone', 'status', 'is_super_admin', 'must_change_password', 'totp_secret', 'totp_confirmed_at',
                'google_sub', 'apple_sub', 'apple_refresh_token', 'failed_logins', 'locked_until', 'last_login_at',
            ]);
        });
    }
};
