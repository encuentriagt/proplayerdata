<?php

namespace App\Mail;

use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;

/** Bienvenida a quien crea su cuenta de padre con Google o Apple (su correo ya viene verificado). */
class WelcomeMail extends Mailable
{
    public function __construct(public string $name, public string $provider) {}

    public function envelope(): Envelope
    {
        return new Envelope(subject: 'Bienvenido a ProPlayer Data');
    }

    public function content(): Content
    {
        $name = e($this->name);
        $via = $this->provider === 'apple' ? 'Apple' : 'Google';
        $html = <<<HTML
<!doctype html><html lang="es"><body style="font-family:Arial,sans-serif;color:#201e1d;background:#f3f2f2;padding:24px">
<div style="max-width:520px;margin:auto;background:#fff;border-radius:8px;padding:28px">
<h2 style="margin-top:0">¡Bienvenido a ProPlayer Data, {$name}!</h2>
<p>Su cuenta quedó creada con {$via}. Para entrar, use siempre el botón «Continuar con {$via}» en la App.</p>
<p>Cuando la institución de su hijo o hija lo invite, verá la invitación en la App y podrá seguir su calendario, convocatorias, asistencia y resultados.</p>
<p style="font-size:13px;color:#4a4644">Si usted no creó esta cuenta, ignore este correo.</p>
</div></body></html>
HTML;

        return new Content(htmlString: $html);
    }
}
