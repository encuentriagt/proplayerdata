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
        if ($this->invitation->role === 'guardian') {
            return new Content(htmlString: $this->guardianHtml($org, $url, $days, $color));
        }

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

    /** Invitación de vínculo padre-hijo: se acepta en la App ProPlayer Data (o con el enlace). */
    private function guardianHtml(string $org, string $url, int $days, string $color): string
    {
        $child = e(\App\Models\Player::find($this->invitation->player_id)?->first_name ?? 'su hijo o hija');
        $code = e((string) $this->invitation->code);

        return <<<HTML
<!doctype html><html lang="es"><body style="font-family:Arial,sans-serif;color:#201e1d;background:#f3f2f2;padding:24px">
<div style="max-width:520px;margin:auto;background:#fff;border-radius:8px;padding:28px">
<h2 style="margin-top:0">{$org}</h2>
<p><strong>{$org}</strong> lo invita a seguir a <strong>{$child}</strong> en la App <strong>ProPlayer Data</strong>: calendario, convocatorias, asistencia y resultados.</p>
<ol style="padding-left:20px;line-height:1.6">
<li>Descargue la App ProPlayer Data y cree su cuenta con <strong>este mismo correo</strong>.</li>
<li>La invitación aparecerá en la App, en <strong>Invitaciones</strong>. Acéptela.</li>
</ol>
<p>Si creó su cuenta con otro correo, en la App elija <strong>«Tengo un código»</strong> y escriba:</p>
<p style="text-align:center;font-size:28px;letter-spacing:4px;font-weight:bold;margin:20px 0">{$code}</p>
<p style="text-align:center;margin:24px 0"><a href="{$url}" style="background:{$color};color:#fff;padding:12px 22px;border-radius:6px;text-decoration:none;display:inline-block">Aceptar invitación</a></p>
<p style="font-size:13px;color:#4a4644">La invitación vence en {$days} días. Si usted no esperaba este correo, puede ignorarlo.</p>
</div></body></html>
HTML;
    }
}
