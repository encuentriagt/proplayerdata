<?php

namespace App\Console\Commands;

use App\Enums\MemberRole;
use App\Enums\OrganizationStatus;
use App\Enums\OrganizationType;
use App\Models\Organization;
use App\Models\OrganizationMember;
use App\Models\User;
use App\Support\Audit;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;

/**
 * Crea una organización (colegio o equipo) con su administrador, mientras no existe el Panel.
 * Es seguro repetirlo: si el slug ya existe, no hace nada.
 *
 * php artisan ppd:org-create --name="Colegio Americano" --slug=colegio-americano --type=school \
 *     --admin-email=admin@colegio.edu.gt --admin-name="Nombre Apellido" \
 *     [--primary=#123456 --secondary=#654321 --on-primary=#FFFFFF]
 */
class CreateOrganization extends Command
{
    protected $signature = 'ppd:org-create
        {--name= : Nombre visible}
        {--slug= : Identificador para la URL (minúsculas, números y guiones)}
        {--type=school : school | team}
        {--admin-email= : Correo del administrador de la organización}
        {--admin-name= : Nombre del administrador}
        {--primary=#25984D : Color primario (#RRGGBB)}
        {--secondary=#201E1D : Color secundario (#RRGGBB)}
        {--on-primary=#FFFFFF : Color de texto sobre el primario (#RRGGBB)}';

    protected $description = 'Crea una organización con marca blanca y su administrador (contraseña temporal mostrada una sola vez).';

    public function handle(): int
    {
        $data = [
            'name' => trim((string) $this->option('name')),
            'slug' => Str::lower(trim((string) $this->option('slug'))),
            'type' => (string) $this->option('type'),
            'admin_email' => Str::lower(trim((string) $this->option('admin-email'))),
            'admin_name' => trim((string) $this->option('admin-name')),
            'primary' => Str::upper((string) $this->option('primary')),
            'secondary' => Str::upper((string) $this->option('secondary')),
            'on_primary' => Str::upper((string) $this->option('on-primary')),
        ];

        $v = Validator::make($data, [
            'name' => ['required', 'string', 'min:3', 'max:150'],
            'slug' => ['required', 'regex:'.Organization::SLUG_REGEX],
            'type' => ['required', 'in:school,team'],
            'admin_email' => ['required', 'email:rfc', 'max:191'],
            'admin_name' => ['required', 'string', 'min:3', 'max:150'],
            'primary' => ['required', 'regex:'.Organization::COLOR_REGEX],
            'secondary' => ['required', 'regex:'.Organization::COLOR_REGEX],
            'on_primary' => ['required', 'regex:'.Organization::COLOR_REGEX],
        ]);

        if ($v->fails()) {
            foreach ($v->errors()->all() as $e) {
                $this->error($e);
            }

            return self::FAILURE;
        }

        if (Organization::withTrashed()->where('slug', $data['slug'])->exists()) {
            $this->warn("Ya existe una organización con el slug \"{$data['slug']}\". No se hizo nada.");

            return self::FAILURE;
        }

        $tempPassword = null;

        [$org, $user] = DB::transaction(function () use ($data, &$tempPassword) {
            $org = Organization::create([
                'name' => $data['name'],
                'slug' => $data['slug'],
                'type' => OrganizationType::from($data['type']),
                'status' => OrganizationStatus::Active,
                'color_primary' => $data['primary'],
                'color_secondary' => $data['secondary'],
                'color_on_primary' => $data['on_primary'],
            ]);

            $user = User::withTrashed()->staff()->where('email', $data['admin_email'])->lockForUpdate()->first();

            if (! $user) {
                $tempPassword = self::temporaryPassword();
                $user = new User(['name' => $data['admin_name'], 'email' => $data['admin_email'], 'password' => $tempPassword]);
                $user->forceFill(['must_change_password' => true, 'status' => 'active'])->save();
            }

            OrganizationMember::firstOrCreate(
                ['organization_id' => $org->id, 'user_id' => $user->id, 'role' => MemberRole::OrgAdmin->value],
                ['status' => 'active'],
            );

            Audit::log('organization.created', $org, ['slug' => $org->slug, 'type' => $data['type']], $org->id);
            Audit::log('member.added', $user, ['role' => MemberRole::OrgAdmin->value], $org->id);

            return [$org, $user];
        });

        $this->info("Organización creada: {$org->name} (slug: {$org->slug}, id: {$org->id})");
        $this->info("Administrador: {$user->email}");

        if ($tempPassword) {
            $this->newLine();
            $this->warn('CONTRASEÑA TEMPORAL (se muestra UNA sola vez; anótela y compártala por un medio seguro):');
            $this->line('    '.$tempPassword);
            $this->warn('Se pedirá cambiarla en el primer inicio de sesión.');
        } else {
            $this->line('El usuario ya existía: conserva su contraseña actual.');
        }

        return self::SUCCESS;
    }

    /** 16 caracteres sin letras ambiguas (0/O, 1/l/I). */
    public static function temporaryPassword(): string
    {
        $alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
        do {
            $p = '';
            for ($i = 0; $i < 16; $i++) {
                $p .= $alphabet[random_int(0, strlen($alphabet) - 1)];
            }
        } while (! preg_match('/[A-Za-z]/', $p) || ! preg_match('/\d/', $p));

        return $p;
    }
}
