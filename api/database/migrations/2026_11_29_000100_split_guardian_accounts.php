<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Cuentas de padre separadas del staff (decisión del dueño, 2026-11-27).
 * - users.account_type: staff (PC y Panel) | guardian (App). El correo es único POR TIPO.
 * - Padres puros → guardian. Quien era staff y padre a la vez → se crea su cuenta de padre (misma
 *   contraseña inicial) y se le mueven hijos, planes, avisos de padre, dispositivos y sesiones de la App.
 */
return new class extends Migration
{
    private const PARENT_KINDS = ['callup', 'trainings', 'event_changed', 'event_cancelled', 'attendance', 'match_result'];

    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('account_type', 10)->default('staff')->after('email');
        });
        Schema::table('users', function (Blueprint $table) {
            $table->dropUnique(['email']);
            $table->unique(['email', 'account_type']);
        });

        $now = now();
        $guardianIds = DB::table('guardian_players')->distinct()->pluck('user_id')
            ->merge(DB::table('plan_grants')->distinct()->pluck('user_id'))->unique();
        $staffIds = DB::table('organization_members')->distinct()->pluck('user_id')
            ->merge(DB::table('users')->where('is_super_admin', true)->pluck('id'))->unique();

        foreach ($guardianIds as $uid) {
            if (! $staffIds->contains($uid)) {
                DB::table('users')->where('id', $uid)->update([
                    'account_type' => 'guardian',
                    'email_verified_at' => DB::raw('COALESCE(email_verified_at, created_at)'),
                ]);

                continue;
            }
            $u = DB::table('users')->where('id', $uid)->first();
            $gid = DB::table('users')->insertGetId([
                'name' => $u->name, 'email' => $u->email, 'account_type' => 'guardian', 'phone' => $u->phone,
                'password' => $u->password, 'status' => $u->status, 'email_verified_at' => $u->email_verified_at ?? $now,
                'created_at' => $now, 'updated_at' => $now,
            ]);
            DB::table('guardian_players')->where('user_id', $uid)->update(['user_id' => $gid]);
            DB::table('plan_grants')->where('user_id', $uid)->update(['user_id' => $gid]);
            DB::table('user_notifications')->where('user_id', $uid)->whereIn('kind', self::PARENT_KINDS)->update(['user_id' => $gid]);
            DB::table('devices')->where('user_id', $uid)->whereIn('platform', ['android', 'ios'])->update(['user_id' => $gid]);
            DB::table('personal_access_tokens')->where('tokenable_type', 'App\\Models\\User')->where('tokenable_id', $uid)
                ->whereIn('name', ['platform:android', 'platform:ios'])->update(['tokenable_id' => $gid]);
        }
    }

    public function down(): void
    {
        // No se pueden volver a unir cuentas de forma segura: solo se revierte el esquema si no hay correos repetidos.
        Schema::table('users', function (Blueprint $table) {
            $table->dropUnique(['email', 'account_type']);
            $table->unique('email');
        });
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('account_type');
        });
    }
};
