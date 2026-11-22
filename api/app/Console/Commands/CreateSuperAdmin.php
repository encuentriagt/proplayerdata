<?php

namespace App\Console\Commands;

use App\Models\User;
use App\Support\Audit;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;

/**
 * Crea (o promueve) el super admin de ppd.
 * php artisan ppd:super-admin --email=correo@dominio --name="Nombre"
 */
class CreateSuperAdmin extends Command
{
    protected $signature = 'ppd:super-admin {--email=} {--name=}';

    protected $description = 'Crea o promueve al super admin de ppd (contraseña temporal mostrada una sola vez).';

    public function handle(): int
    {
        $email = Str::lower(trim((string) $this->option('email')));
        $name = trim((string) $this->option('name'));

        $v = Validator::make(compact('email', 'name'), [
            'email' => ['required', 'email:rfc', 'max:191'],
            'name' => ['required', 'string', 'min:3', 'max:150'],
        ]);
        if ($v->fails()) {
            foreach ($v->errors()->all() as $e) {
                $this->error($e);
            }

            return self::FAILURE;
        }

        $user = User::withTrashed()->where('email', $email)->first();
        $temp = null;

        if (! $user) {
            $temp = CreateOrganization::temporaryPassword();
            $user = new User(['name' => $name, 'email' => $email, 'password' => $temp]);
            $user->forceFill(['must_change_password' => true, 'status' => 'active']);
        }

        if ($user->is_super_admin && $user->exists) {
            $this->warn('Ese usuario ya es super admin. No se hizo nada.');

            return self::SUCCESS;
        }

        $user->forceFill(['is_super_admin' => true])->save();
        Audit::log('user.super_admin_granted', $user);

        $this->info("Super admin: {$user->email}");
        if ($temp) {
            $this->warn('CONTRASEÑA TEMPORAL (se muestra UNA sola vez):');
            $this->line('    '.$temp);
            $this->warn('Se pedirá cambiarla y activar el código TOTP en el primer inicio de sesión.');
        }

        return self::SUCCESS;
    }
}
