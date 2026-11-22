<?php

namespace App\Mail;

use App\Models\Invitation;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;

/** Correo de invitación (sin plantillas Blade: HTML simple y texto). Trato de usted. */
class InvitationMail extends Mailable
{
    public function __construct(public Invitation $invitation, public string $url, public string $roleLabel) {}

    public function envelope(): Envelope
    {
        return new Envelope(subject: 'Invitación de '.$this->invitation->organization->name.' en ppd');
    }

    public function content(): Content
    {
        $org = e($this->invitation->organization->name);
        $role = e($this->roleLabel);
        $url = e($this->url);
        $days = (int) config('ppd.invitations.days_valid');
        $color = e($this->invitation->organization->color_primary ?: '#25984D');

        $html = <<<HTML
<!doctype html><html lang="es"><body style="font-family:Arial,sans-serif;color:#201e1d;background:#f3f2f2;padding:24px">
<div style="max-width:520px;margin:auto;background:#fff;border-radius:8px;padding:28px">
<h2 style="margin-top:0">{$org}</h2>
<p>Le invitamos a unirse a <strong>{$org}</strong> en ppd como <strong>{$role}</strong>.</p>
<p style="text-align:center;margin:28px 0"><a href="{$url}" style="background:{$color};color:#fff;padding:12px 22px;border-radius:6px;text-decoration:none;display:inline-block">Aceptar invitación</a></p>
<p style="font-size:13px;color:#4a4644">El enlace vence en {$days} días. Si usted no esperaba este correo, puede ignorarlo.</p>
<p style="font-size:12px;color:#8a8583">Powered by ppd</p>
</div></body></html>
HTML;

        return new Content(htmlString: $html);
    }
}
