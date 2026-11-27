<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\Mail;

/** Envía un correo de prueba para confirmar que el SMTP funciona. No muestra credenciales. */
class MailTest extends Command
{
    protected $signature = 'ppd:mail-test {email : Correo que recibe la prueba}';

    protected $description = 'Envía un correo de prueba con la configuración actual';

    public function handle(): int
    {
        $to = (string) $this->argument('email');
        if (! filter_var($to, FILTER_VALIDATE_EMAIL)) {
            $this->error('Correo no válido.');

            return self::FAILURE;
        }
        $this->line('Transporte: '.config('mail.default').' · '.config('mail.mailers.smtp.host').':'.config('mail.mailers.smtp.port').' · desde '.config('mail.from.address'));
        try {
            Mail::html('<p>Este es un correo de prueba de <b>ProPlayer Data</b>. Si lo recibe, el envío de correos funciona.</p>', function ($m) use ($to) {
                $m->to($to)->subject('Prueba de correo · ProPlayer Data');
            });
        } catch (\Throwable $e) {
            $this->error('No se pudo enviar: '.preg_replace('/(password|pass)=\S+/i', '$1=***', $e->getMessage()));

            return self::FAILURE;
        }
        $this->info("Enviado a {$to}. Revise la bandeja de entrada y la de spam.");

        return self::SUCCESS;
    }
}
