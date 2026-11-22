<?php

namespace App\Console\Commands;

use App\Models\IdempotencyKey;
use App\Models\Invitation;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * Limpieza diaria (cron 3:10 a. m., hora de Guatemala). Solo borra datos vencidos; es seguro repetirlo.
 */
class DailyMaintenance extends Command
{
    protected $signature = 'ppd:maintenance';

    protected $description = 'Limpieza diaria: claves de idempotencia, tokens e invitaciones vencidas, registros viejos.';

    public function handle(): int
    {
        $r = [
            'idempotency' => IdempotencyKey::where('expires_at', '<', now())->delete(),
            'tokens' => DB::table('personal_access_tokens')->where('expires_at', '<', now()->subDay())->delete(),
            'invitations' => Invitation::whereNull('accepted_at')->where('expires_at', '<', now()->subDays(30))->delete(),
            'notification_logs' => DB::table('notification_logs')->where('sent_at', '<', now()->subDays(400))->delete(),
            'notifications' => DB::table('user_notifications')->where('created_at', '<', now()->subDays(400))->delete(),
            'cache' => DB::table('cache')->where('expiration', '<', now()->timestamp)->delete(),
        ];
        Log::info('ppd:maintenance', $r);
        $this->line(now()->toDateTimeString().' '.json_encode($r));

        return self::SUCCESS;
    }
}
