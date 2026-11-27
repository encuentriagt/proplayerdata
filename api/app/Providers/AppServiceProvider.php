<?php

namespace App\Providers;

use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Facades\URL;
use Illuminate\Support\ServiceProvider;
use Illuminate\Validation\Rules\Password;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->singleton(\App\Services\Push\PushSender::class, fn () => config('ppd.push.driver') === 'fcm'
            ? new \App\Services\Push\FcmPushSender(config('ppd.push.fcm_credentials'))
            : new \App\Services\Push\LogPushSender);
    }

    public function boot(): void
    {
        // Errores de Eloquent visibles en desarrollo (atributos no permitidos, carga perezosa).
        Model::shouldBeStrict(! $this->app->isProduction());

        if ($this->app->isProduction()) {
            URL::forceScheme('https');
        }

        // Contraseñas: mínimo 10, letras y números; en producción, verificación contra filtraciones.
        Password::defaults(function () {
            $rule = Password::min(10)->letters()->numbers();

            return $this->app->isProduction() ? $rule->uncompromised() : $rule;
        });

        // Límites de peticiones (docs/ARQUITECTURA.md, sección 12).
        RateLimiter::for('public', fn (Request $r) => Limit::perMinute(60)->by($r->ip()));
        // Registro de padres: 5/hora y 20/día por IP. Reenvío del código: 1/min y 10/día por cuenta.
        RateLimiter::for('register', fn (Request $r) => [
            Limit::perHour(5)->by('reg:'.$r->ip()),
            Limit::perDay(20)->by('reg-day:'.$r->ip()),
        ]);
        RateLimiter::for('email-resend', fn (Request $r) => [
            Limit::perMinute(1)->by('resend:'.($r->user()?->id ?: $r->ip())),
            Limit::perDay(10)->by('resend-day:'.($r->user()?->id ?: $r->ip())),
        ]);
        // Buscador público de instituciones: 30/min y 300/día por IP, para que no se pueda listar el directorio.
        RateLimiter::for('org-search', fn (Request $r) => [
            Limit::perMinute(30)->by('orgsearch:'.$r->ip()),
            Limit::perDay(300)->by('orgsearch-day:'.$r->ip()),
        ]);
        RateLimiter::for('api', fn (Request $r) => Limit::perMinute(120)->by($r->user()?->getAuthIdentifier() ?: $r->ip()));
        RateLimiter::for('login', fn (Request $r) => [
            Limit::perMinute(5)->by(mb_strtolower((string) $r->input('email')).'|'.$r->ip()),
            Limit::perMinute(20)->by($r->ip()),
        ]);
        RateLimiter::for('social', fn (Request $r) => [
            Limit::perMinute(15)->by('social:'.$r->ip()),
            Limit::perHour(60)->by('social-h:'.$r->ip()),
        ]);
        RateLimiter::for('invites', fn (Request $r) => Limit::perMinute(30)->by($r->user()?->getAuthIdentifier() ?: $r->ip()));
        RateLimiter::for('codes', fn (Request $r) => Limit::perMinute(5)->by($r->user()?->getAuthIdentifier() ?: $r->ip()));
    }
}
