<?php

namespace App\Mail;

use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;

class PasswordResetMail extends Mailable
{
    public function __construct(public string $url, public int $minutes) {}

    public function envelope(): Envelope
    {
        return new Envelope(subject: 'Restablecer su contraseña de ppd');
    }

    public function content(): Content
    {
        $url = e($this->url);
        $html = <<<HTML
<!doctype html><html lang="es"><body style="font-family:Arial,sans-serif;color:#201e1d;background:#f3f2f2;padding:24px">
<div style="max-width:520px;margin:auto;background:#fff;border-radius:8px;padding:28px">
<h2 style="margin-top:0">Restablecer contraseña</h2>
<p>Recibimos una solicitud para restablecer la contraseña de su cuenta.</p>
<p style="text-align:center;margin:28px 0"><a href="{$url}" style="background:#25984D;color:#fff;padding:12px 22px;border-radius:6px;text-decoration:none;display:inline-block">Crear nueva contraseña</a></p>
<p style="font-size:13px;color:#4a4644">El enlace vence en {$this->minutes} minutos. Si usted no lo pidió, ignore este correo: su contraseña no cambia.</p>
<p style="font-size:12px;color:#8a8583">Powered by ppd</p>
</div></body></html>
HTML;

        return new Content(htmlString: $html);
    }
}
