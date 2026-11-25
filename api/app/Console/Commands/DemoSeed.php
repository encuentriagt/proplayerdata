<?php

namespace App\Console\Commands;

use App\Models\Event;
use App\Models\GuardianPlayer;
use App\Models\Organization;
use App\Models\OrganizationMember;
use App\Models\Player;
use App\Models\PlayerEventStat;
use App\Models\Sport;
use App\Models\Team;
use App\Models\TeamPlayer;
use App\Models\TeamStaff;
use App\Models\User;
use App\Services\MatchSheetService;
use App\Support\Audit;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

/**
 * Datos de prueba para los agentes (organización "Colegio Demo ppd", slug colegio-demo).
 *   php artisan ppd:demo-seed           crea todo (si ya existe, no hace nada)
 *   php artisan ppd:demo-seed --purge   borra la organización demo y sus usuarios demo
 * Las contraseñas se muestran UNA sola vez. Correos @demo.ppdguate.com (no reciben correo).
 */
class DemoSeed extends Command
{
    protected $signature = 'ppd:demo-seed {--purge : Borra la organización demo y sus usuarios}';

    protected $description = 'Crea (o borra) la organización de prueba colegio-demo con usuarios, equipos, jugadores y partidos.';

    private const SLUG = 'colegio-demo';

    private const DOMAIN = '@demo.ppdguate.com';

    public function handle(MatchSheetService $sheets): int
    {
        if ($this->option('purge')) {
            return $this->purge();
        }

        if (Organization::withTrashed()->where('slug', self::SLUG)->exists()) {
            $this->warn('La organización colegio-demo ya existe. Use --purge para borrarla antes.');

            return self::FAILURE;
        }

        $passwords = [];

        DB::transaction(function () use (&$passwords, $sheets) {
            $org = Organization::create([
                'name' => 'Colegio Demo ppd', 'slug' => self::SLUG, 'type' => 'school', 'status' => 'active',
                'color_primary' => '#0A3D91', 'color_secondary' => '#F2B705', 'color_on_primary' => '#FFFFFF',
                'quota_pro' => 10, 'quota_premium' => 5, 'branding_editable_by_org' => true,
            ]);
            $org->forceFill(['crest_path' => $this->crest($org)])->save();

            $mk = function (string $key, string $name) use (&$passwords) {
                $pass = CreateOrganization::temporaryPassword();
                $u = new User(['name' => $name, 'email' => $key.self::DOMAIN, 'password' => $pass]);
                $u->forceFill(['status' => 'active', 'email_verified_at' => now()])->save();
                $passwords[$u->email] = $pass;

                return $u;
            };
            $admin = $mk('admin', 'Ana Administradora');
            $director = $mk('director', 'Diego Director');
            $coach = $mk('coach', 'Carlos Coach');
            $papa = $mk('padre', 'Pedro Padre');
            foreach ([[$admin, 'org_admin'], [$director, 'director'], [$coach, 'coach']] as [$u, $role]) {
                OrganizationMember::create(['organization_id' => $org->id, 'user_id' => $u->id, 'role' => $role, 'status' => 'active']);
            }

            $season = $org->seasons()->create(['name' => 'Temporada 2026-2027', 'starts_on' => '2026-08-01', 'ends_on' => '2027-06-30', 'is_current' => true]);
            $futbol = Sport::with('positions')->where('code', 'soccer')->firstOrFail();
            $basquet = Sport::with('positions')->where('code', 'basketball')->firstOrFail();
            \App\Support\Positions::enableSports($org, [$futbol->id, $basquet->id]);

            $sub12 = $org->teams()->create(['name' => 'Fútbol Sub-12', 'sport_id' => $futbol->id, 'season_id' => $season->id, 'category' => 'Sub-12', 'gender' => 'mixed', 'color' => '#0A3D91']);
            $sub15 = $org->teams()->create(['name' => 'Fútbol Sub-15', 'sport_id' => $futbol->id, 'season_id' => $season->id, 'category' => 'Sub-15', 'gender' => 'male']);
            $juvenil = $org->teams()->create(['name' => 'Básquet Juvenil', 'sport_id' => $basquet->id, 'season_id' => $season->id, 'category' => 'Juvenil', 'gender' => 'female', 'color' => '#F2B705']);
            foreach ([$sub12, $juvenil] as $t) {
                TeamStaff::create(['team_id' => $t->id, 'user_id' => $coach->id, 'role' => 'head_coach']);
            }
            // Director técnico de fútbol (ve y maneja los dos equipos de fútbol, no el de básquet).
            \App\Models\DirectorScope::create(['organization_id' => $org->id, 'user_id' => $director->id, 'sport_id' => $futbol->id]);

            $names = ['Ana López', 'Luis Pérez', 'María García', 'José Hernández', 'Sofía Morales', 'Diego Castillo', 'Valeria Ruiz', 'Mateo Díaz', 'Camila Reyes', 'Andrés Cruz', 'Lucía Ramírez', 'Pablo Ortiz', 'Daniela Flores', 'Javier Méndez', 'Isabel Vásquez', 'Tomás Rivera', 'Elena Gómez', 'Samuel Aguilar'];
            $players = [];
            foreach ($names as $i => $n) {
                [$f, $l] = explode(' ', $n);
                $players[$i] = Player::create(['organization_id' => $org->id, 'first_name' => $f, 'last_name' => $l, 'birthdate' => now()->subYears(11 + ($i % 6))->subDays($i * 17)->toDateString(), 'gender' => $i % 2 ? 'male' : 'female']);
            }
            $roster = function (Team $t, Sport $s, array $idx) use ($players) {
                $pos = $s->positions->values();
                foreach ($idx as $k => $i) {
                    TeamPlayer::create(['team_id' => $t->id, 'player_id' => $players[$i]->id, 'jersey_number' => $k + 1, 'sport_position_id' => $pos[$k % $pos->count()]->id]);
                }
            };
            $roster($sub12, $futbol, range(0, 9));
            $roster($sub15, $futbol, range(10, 15));
            $roster($juvenil, $basquet, [0, 2, 4, 6, 8, 16, 17]);

            GuardianPlayer::create(['user_id' => $papa->id, 'player_id' => $players[0]->id, 'relationship' => 'padre', 'verified_at' => now()]);

            // Partido pasado SIN ficha, partido pasado CON resultado publicado y actividades futuras.
            Event::create(['organization_id' => $org->id, 'team_id' => $sub12->id, 'type' => 'match', 'status' => 'scheduled', 'starts_at' => now()->subDays(2)->setTime(9, 0), 'opponent_name' => 'Colegio Rival', 'home_away' => 'away', 'location' => 'Cancha Rival', 'created_by' => $coach->id]);
            $jugado = Event::create(['organization_id' => $org->id, 'team_id' => $sub12->id, 'type' => 'match', 'status' => 'scheduled', 'starts_at' => now()->subDays(9)->setTime(10, 0), 'opponent_name' => 'Academia Norte', 'home_away' => 'home', 'location' => 'Cancha 1', 'created_by' => $coach->id]);
            $sheets->save($jugado, [
                'score_us' => 3, 'score_them' => 1, 'publish' => true,
                'lineup' => collect(range(0, 6))->map(fn ($i) => ['player_id' => $players[$i]->id, 'is_starter' => $i < 7, 'minutes_played' => 50])->all(),
                'actions' => [
                    ['stat_code' => 'goal', 'player_id' => $players[0]->id, 'minute' => 12],
                    ['stat_code' => 'goal', 'player_id' => $players[0]->id, 'minute' => 33],
                    ['stat_code' => 'assist', 'player_id' => $players[1]->id],
                    ['stat_code' => 'goal', 'player_id' => $players[3]->id, 'minute' => 45],
                    ['stat_code' => 'yellow_card', 'player_id' => $players[2]->id],
                ],
            ], $coach);
            Event::create(['organization_id' => $org->id, 'team_id' => $sub12->id, 'type' => 'training', 'status' => 'scheduled', 'starts_at' => now()->addDays(1)->setTime(15, 30), 'location' => 'Cancha 1', 'created_by' => $coach->id]);
            Event::create(['organization_id' => $org->id, 'team_id' => $juvenil->id, 'type' => 'match', 'status' => 'scheduled', 'starts_at' => now()->addDays(5)->setTime(16, 0), 'opponent_name' => 'Liceo Central', 'home_away' => 'home', 'location' => 'Gimnasio', 'created_by' => $coach->id]);
            Event::create(['organization_id' => $org->id, 'team_id' => $sub15->id, 'type' => 'match', 'status' => 'scheduled', 'starts_at' => now()->addDays(6)->setTime(9, 0), 'opponent_name' => 'Instituto Sur', 'home_away' => 'away', 'created_by' => $director->id]);

            Audit::log('demo.seeded', $org, [], $org->id);
        });

        $this->info('Organización demo creada: Colegio Demo ppd (slug: colegio-demo)');
        $this->line('Director técnico: fútbol (Sub-12 y Sub-15). Coach: "Fútbol Sub-12" y "Básquet Juvenil". Padre vinculado a Ana López.');
        $this->newLine();
        $this->warn('ACCESOS (se muestran UNA sola vez; compártalos por un medio seguro):');
        foreach ($passwords as $email => $pass) {
            $this->line(sprintf('  %-32s %s', $email, $pass));
        }

        return self::SUCCESS;
    }

    private function purge(): int
    {
        $org = Organization::withTrashed()->where('slug', self::SLUG)->first();
        DB::transaction(function () use ($org) {
            if ($org) {
                Storage::disk('public')->deleteDirectory("orgs/{$org->id}");
                $org->forceDelete();
            }
            User::withTrashed()->where('email', 'like', '%'.self::DOMAIN)->get()->each(function (User $u) {
                $u->tokens()->delete();
                $u->forceDelete();
            });
        });
        $this->info('Datos demo borrados.');

        return self::SUCCESS;
    }

    /** Escudo simple generado con GD (sin archivos externos). */
    private function crest(Organization $org): ?string
    {
        if (! function_exists('imagecreatetruecolor')) {
            return null;
        }
        $s = 256;
        $im = imagecreatetruecolor($s, $s);
        imagesavealpha($im, true);
        imagefill($im, 0, 0, imagecolorallocatealpha($im, 0, 0, 0, 127));
        $blue = imagecolorallocate($im, 0x0A, 0x3D, 0x91);
        $gold = imagecolorallocate($im, 0xF2, 0xB7, 0x05);
        $white = imagecolorallocate($im, 255, 255, 255);
        imagefilledpolygon($im, [40, 30, 216, 30, 216, 130, 128, 236, 40, 130], $gold);
        imagefilledpolygon($im, [52, 42, 204, 42, 204, 126, 128, 220, 52, 126], $blue);
        imagefilledrectangle($im, 52, 80, 204, 92, $gold);
        imagestring($im, 5, 106, 120, 'CD', $white);
        ob_start();
        imagepng($im);
        $png = ob_get_clean();
        imagedestroy($im);
        $path = "orgs/{$org->id}/crest-".Str::uuid().'.png';
        Storage::disk('public')->put($path, $png);

        return $path;
    }
}
