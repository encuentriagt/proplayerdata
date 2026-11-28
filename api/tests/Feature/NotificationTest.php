<?php

namespace Tests\Feature;

use App\Models\Device;
use App\Models\UserNotification;
use App\Services\NotificationService;
use App\Services\Push\PushSender;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Support\BuildsOrgs;
use Tests\TestCase;

class FakePush implements PushSender
{
    public array $sent = [];

    public array $invalid = [];

    public function send(array $tokens, string $title, string $body, array $data = [], string $channel = 'general'): array
    {
        $this->sent[] = compact('tokens', 'title', 'body', 'data', 'channel');

        return array_combine($tokens, array_map(fn ($t) => in_array($t, $this->invalid, true) ? 'invalid' : 'ok', $tokens));
    }
}

class NotificationTest extends TestCase
{
    use BuildsOrgs, RefreshDatabase;

    public function test_registrar_dispositivo_y_bandeja(): void
    {
        $u = $this->makeUser('p@x.test');
        $token = str_repeat('t', 150);
        $this->as($u)->postJson('/api/me/devices', ['token' => $token, 'platform' => 'android'])->assertOk();
        $this->as($u)->postJson('/api/me/devices', ['token' => $token, 'platform' => 'android'])->assertOk();
        $this->assertSame(1, Device::count());

        // Otro usuario en el mismo teléfono: el token se reasigna.
        $u2 = $this->makeUser('q@x.test');
        $this->as($u2)->postJson('/api/me/devices', ['token' => $token, 'platform' => 'android'])->assertOk();
        $this->assertSame($u2->id, Device::first()->user_id);

        $this->as($u2)->deleteJson('/api/me/devices', ['token' => $token])->assertOk();
        $this->assertSame(0, Device::count());
    }

    public function test_avisos_sin_duplicar_push_despues_de_responder_y_tokens_invalidos(): void
    {
        $fake = new FakePush;
        $fake->invalid = ['malo'.str_repeat('x', 30)];
        $this->app->instance(PushSender::class, $fake);

        $a = $this->makeUser('a@x.test');
        $b = $this->makeUser('b@x.test');
        Device::create(['user_id' => $a->id, 'platform' => 'ios', 'fcm_token' => 'bueno'.str_repeat('x', 30), 'token_hash' => hash('sha256', 'bueno'.str_repeat('x', 30))]);
        Device::create(['user_id' => $b->id, 'platform' => 'android', 'fcm_token' => 'malo'.str_repeat('x', 30), 'token_hash' => hash('sha256', 'malo'.str_repeat('x', 30))]);

        $svc = app(NotificationService::class);
        $this->assertSame(2, $svc->notify([$a->id, $b->id, $a->id], 'match_result', 'event:1:score:2-1', 'Resultado', 'Ganamos 2-1', ['event_id' => 1]));
        $this->assertSame(0, $svc->notify([$a->id, $b->id], 'match_result', 'event:1:score:2-1', 'Resultado', 'Ganamos 2-1'));
        $this->assertSame(2, UserNotification::count());
        $this->assertCount(0, $fake->sent); // todavía no: sale al terminar la petición

        $this->app->terminate();
        $this->assertCount(2, $fake->sent); // un envío por usuario, con su notification_id
        $this->assertSame('1', $fake->sent[0]['data']['event_id']);
        $this->assertSame((string) UserNotification::where('user_id', $a->id)->value('id'), $fake->sent[0]['data']['notification_id']);
        $this->assertSame(1, Device::count()); // el token inválido se borró

        $this->as($a)->getJson('/api/me/notifications')->assertOk()->assertJsonPath('meta.unread', 1)->assertJsonPath('data.0.title', 'Resultado');
        $this->as($a)->postJson('/api/me/notifications/read', [])->assertOk()->assertJsonPath('data.updated', 1);
        $this->as($b)->getJson('/api/me/notifications')->assertJsonPath('meta.unread', 1);
    }
}
