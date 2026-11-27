<?php

namespace App\Mail;

use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;

/** Código de 6 dígitos de la App de padres (verificar correo o restablecer contraseña). */
class EmailCodeMail extends Mailable
{
    public function __construct(public string $code, public string $purpose, public int $minutes) {}

    public function envelope(): Envelope
    {
        return new Envelope(subject: $this->purpose === 'reset'
            ? 'Código para restablecer su contraseña de ProPlayer Data'
            : 'Su código de verificación de ProPlayer Data');
    }

    public function content(): Content
    {
        $code = e($this->code);
        $intro = $this->purpose === 'reset'
            ? 'Use este código en la App para crear una nueva contraseña.'
            : 'Use este código en la App para verificar su correo.';
        $html = <<<HTML
<!doctype html><html lang="es"><body style="font-family:Arial,sans-serif;color:#201e1d;background:#f3f2f2;padding:24px">
<div style="max-width:520px;margin:auto;background:#fff;border-radius:8px;padding:28px">
<h2 style="margin-top:0">ProPlayer Data</h2>
<p>{$intro}</p>
<p style="text-align:center;font-size:32px;letter-spacing:8px;font-weight:bold;margin:28px 0">{$code}</p>
<p style="font-size:13px;color:#4a4644">Vence en {$this->minutes} minutos. No lo comparta con nadie. Si usted no lo pidió, ignore este correo.</p>
</div></body></html>
HTML;

        return new Content(htmlString: $html);
    }
}
