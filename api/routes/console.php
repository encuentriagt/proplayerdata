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

// Sin cola por ahora (docs/ARQUITECTURA.md, sección 16): avisos se envían con afterResponse.
// Cuando exista el módulo de emergencias se agregará aquí su repetición.
