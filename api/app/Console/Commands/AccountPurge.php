<?php

namespace App\Console\Commands;

use App\Models\User;
use App\Support\Audit;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * Borra POR COMPLETO una cuenta (incluida una ya eliminada o sin verificar) para que el correo pueda
 * registrarse de nuevo. Sin --force solo muestra lo que borraría. Lo corre el workflow "Borrar cuenta"
 * después de respaldar la base de datos. No borra super admins ni admins activos de una organización.
 */
class AccountPurge extends Command
{
    protected $signature = 'ppd:account-purge {email} {--type=guardian : guardian (App) o staff (PC)} {--force : Borrar de verdad}';

    protected $description = 'Borra por completo una cuenta por correo (con vista previa)';

    public function handle(): int
    {
        $email = mb_strtolower(trim((string) $this->argument('email')));
        $type = (string) $this->option('type');
        if (! in_array($type, [User::GUARDIAN, User::STAFF], true) || ! filter_var($email, FILTER_VALIDATE_EMAIL)) {
            $this->error('Correo o tipo no válidos.');

            return self::FAILURE;
        }
        $users = User::withTrashed()->where('email', $email)->where('account_type', $type)->get();
        if ($users->isEmpty()) {
            $this->warn("No existe una cuenta {$type} con ese correo. No hay nada que borrar.");

            return self::SUCCESS;
        }
        foreach ($users as $u) {
            if ($u->is_super_admin) {
                $this->error('Es super admin: no se borra con este comando.');

                return self::FAILURE;
            }
            if (DB::table('organization_members')->where('user_id', $u->id)->where('role', 'org_admin')->where('status', 'active')->exists()) {
                $this->error('Es administrador activo de una organización: quítele ese rol primero.');

                return self::FAILURE;
            }
        }

        $ids = $users->pluck('id')->all();
        $counts = [
            'cuentas' => count($ids),
            'hijos vinculados' => DB::table('guardian_players')->whereIn('user_id', $ids)->count(),
            'membresías' => DB::table('organization_members')->whereIn('user_id', $ids)->count(),
            'dispositivos' => DB::table('devices')->whereIn('user_id', $ids)->count(),
            'avisos' => DB::table('user_notifications')->whereIn('user_id', $ids)->count(),
            'planes' => DB::table('plan_grants')->whereIn('user_id', $ids)->count(),
            'sesiones' => DB::table('personal_access_tokens')->where('tokenable_type', User::class)->whereIn('tokenable_id', $ids)->count(),
        ];
        $this->line("Cuenta {$type} {$email} (id ".implode(', ', $ids).')'.($users->first()->trashed() ? ' [ya eliminada]' : '').($users->first()->email_verified_at ? '' : ' [sin verificar]'));
        foreach ($counts as $k => $v) {
            $this->line("  {$k}: {$v}");
        }
        if (! $this->option('force')) {
            $this->warn('Vista previa: no se borró nada (falta --force).');

            return self::SUCCESS;
        }

        DB::transaction(function () use ($ids) {
            DB::table('personal_access_tokens')->where('tokenable_type', User::class)->whereIn('tokenable_id', $ids)->delete();
            DB::table('sessions')->whereIn('user_id', $ids)->delete();
            DB::table('idempotency_keys')->whereIn('scope', array_map(fn ($i) => 'u:'.$i, $ids))->delete();
            // Las demás tablas se borran solas (ON DELETE CASCADE) o quedan sin autor (SET NULL).
            User::withTrashed()->whereIn('id', $ids)->forceDelete();
        });
        Audit::log('account.purged', null, ['type' => $type, 'ids' => $ids]);
        $this->info('Cuenta borrada por completo. El correo ya se puede registrar de nuevo.');

        return self::SUCCESS;
    }
}
