<?php

use App\Models\IdempotencyKey;
use Illuminate\Support\Facades\Schedule;

/*
| Tareas programadas. En cPanel el cron ejecuta "schedule:run" cada minuto;
| en un VPS se usa el mismo comando (docs/ARQUITECTURA.md, sección 15).
*/

// Limpia claves de idempotencia vencidas.
Schedule::call(fn () => IdempotencyKey::where('expires_at', '<', now())->delete())
    ->name('ppd:prune-idempotency')->dailyAt('03:10')->withoutOverlapping();

// Tokens de Sanctum vencidos.
Schedule::command('sanctum:prune-expired --hours=24')->dailyAt('03:20')->withoutOverlapping();

// Procesa la cola sin un proceso permanente (hosting compartido).
// Hoy cada 5 minutos (carga mínima). Cuando existan push/emergencias se pasa a cada minuto
// (PPD_QUEUE_EVERY_MINUTE=true en .env y cron a cada minuto).
$queue = Schedule::command('queue:work --stop-when-empty --max-time=50 --tries=3')->withoutOverlapping(5);
env('PPD_QUEUE_EVERY_MINUTE', false) ? $queue->everyMinute() : $queue->everyFiveMinutes();
