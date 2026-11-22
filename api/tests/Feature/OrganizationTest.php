<?php

namespace Tests\Feature;

use App\Enums\OrganizationStatus;
use App\Models\AuditLog;
use App\Models\Organization;
use App\Models\OrganizationMember;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class OrganizationTest extends TestCase
{
    use RefreshDatabase;

    private function crear(array $extra = []): int
    {
        return $this->artisan('ppd:org-create', array_merge([
            '--name' => 'Colegio Demo',
            '--slug' => 'colegio-demo',
            '--type' => 'school',
            '--admin-email' => 'Admin@Demo.test',
            '--admin-name' => 'Admin Demo',
            '--primary' => '#0a3d91',
        ], $extra))->run();
    }

    public function test_crea_organizacion_admin_y_auditoria(): void
    {
        $this->assertSame(0, $this->crear());

        $org = Organization::where('slug', 'colegio-demo')->firstOrFail();
        $this->assertSame('#0A3D91', $org->color_primary);
        $this->assertSame(OrganizationStatus::Active, $org->status);

        $user = User::where('email', 'admin@demo.test')->firstOrFail();
        $this->assertTrue($user->must_change_password);
        $this->assertFalse($user->is_super_admin);
        $this->assertTrue(Hash::needsRehash($user->password) === false);

        $this->assertDatabaseHas('organization_members', [
            'organization_id' => $org->id, 'user_id' => $user->id, 'role' => 'org_admin', 'status' => 'active',
        ]);
        $this->assertSame(2, AuditLog::where('organization_id', $org->id)->count());
    }

    public function test_repetir_no_duplica(): void
    {
        $this->assertSame(0, $this->crear());
        $this->assertSame(1, $this->crear());
        $this->assertSame(1, Organization::count());
        $this->assertSame(1, User::count());
        $this->assertSame(1, OrganizationMember::count());
    }

    public function test_valida_slug_y_colores(): void
    {
        $this->assertSame(1, $this->crear(['--slug' => 'Mal Slug!']));
        $this->assertSame(1, $this->crear(['--slug' => 'ok-slug', '--primary' => 'rojo']));
        $this->assertSame(0, Organization::count());
    }

    public function test_branding_publico(): void
    {
        $this->crear();

        $r = $this->getJson('/api/public/orgs/colegio-demo/branding')
            ->assertOk()
            ->assertJsonPath('data.name', 'Colegio Demo')
            ->assertJsonPath('data.active', true)
            ->assertJsonPath('data.colors.primary', '#0A3D91')
            ->assertJsonPath('data.powered_by', 'ppd')
            ->assertJsonMissingPath('data.contact_email')
            ->assertJsonMissingPath('data.quota_pro');

        $this->assertStringContainsString('public', $r->headers->get('Cache-Control'));
        $etag = $r->headers->get('ETag');
        $this->assertNotEmpty($etag);

        $this->withHeaders(['If-None-Match' => $etag])->get('/api/public/orgs/colegio-demo/branding')->assertStatus(304);
    }

    public function test_branding_suspendida_e_inexistente(): void
    {
        $this->crear();
        Organization::where('slug', 'colegio-demo')->update(['status' => 'suspended']);

        $this->getJson('/api/public/orgs/colegio-demo/branding')->assertOk()->assertJsonPath('data.active', false);
        $this->getJson('/api/public/orgs/no-existe/branding')->assertNotFound()->assertJsonPath('error.code', 'not_found');
        $this->getJson('/api/public/orgs/..%2Fetc/branding')->assertNotFound();
    }

    public function test_campos_sensibles_no_asignables_en_masa(): void
    {
        // En desarrollo/pruebas Eloquent estricto lanza error; en producción el campo se descarta.
        $this->expectException(\Illuminate\Database\Eloquent\MassAssignmentException::class);
        new User(['name' => 'X', 'email' => 'x@x.test', 'password' => 'Secreta1234', 'is_super_admin' => true]);
    }

    public function test_super_admin(): void
    {
        $this->artisan('ppd:super-admin', ['--email' => 'dueno@ppd.test', '--name' => 'Dueño'])->assertExitCode(0);
        $u = User::where('email', 'dueno@ppd.test')->firstOrFail();
        $this->assertTrue($u->is_super_admin);
        $this->assertTrue($u->must_change_password);
        $this->artisan('ppd:super-admin', ['--email' => 'dueno@ppd.test', '--name' => 'Dueño'])->assertExitCode(0);
        $this->assertSame(1, User::count());
    }

    public function test_auditoria_no_guarda_secretos(): void
    {
        \App\Support\Audit::log('prueba', null, ['password' => 'x', 'api_token' => 'y', 'ok' => 1]);
        $this->assertSame(['ok' => 1], AuditLog::first()->data);
    }
}
