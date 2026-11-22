<?php

namespace Tests\Feature;

use App\Models\Event;
use App\Models\Organization;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class DemoSeedTest extends TestCase
{
    use RefreshDatabase;

    public function test_crea_datos_demo_completos_y_se_pueden_borrar(): void
    {
        Storage::fake('public');
        $this->artisan('ppd:demo-seed')->assertExitCode(0);
        $org = Organization::where('slug', 'colegio-demo')->firstOrFail();
        $this->assertSame(3, $org->teams()->count());
        $this->assertSame(1, Event::whereNotNull('result_published_at')->count());
        $this->assertSame(4, User::where('email', 'like', '%@demo.ppdguate.com')->count());
        $this->assertNotNull($org->crest_path);

        $this->artisan('ppd:demo-seed')->assertExitCode(1);
        $this->artisan('ppd:demo-seed --purge')->assertExitCode(0);
        $this->assertSame(0, Organization::withTrashed()->count());
        $this->assertSame(0, User::withTrashed()->count());
    }
}
