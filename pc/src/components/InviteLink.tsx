import { useState } from 'react'
import { Check, Copy, MessageCircle } from 'lucide-react'
import { Alert } from './ui'

/** Enlace de invitación con "Copiar enlace" y "Enviar por WhatsApp" (el correo todavía puede no estar activo). */
export function InviteLink({ url, orgName, roleLabel }: { url: string; orgName: string; roleLabel: string }) {
  return (
    <ShareLink url={url} notice="Invitación lista. Compártala con este enlace; el anterior, si existía, ya no sirve."
      text={`Le invitamos a ${orgName} como ${roleLabel} en ppd. Acepte la invitación aquí: ${url}`} />
  )
}

/** Enlace para crear una nueva contraseña (lo genera el admin; vence en 24 h). */
export function ResetLink({ url, orgName }: { url: string; orgName: string }) {
  return (
    <ShareLink url={url} notice="Enlace creado. Vence en 24 horas y sirve una sola vez."
      text={`Para crear una nueva contraseña en la Plataforma Coach de ${orgName}, abra este enlace: ${url}`} />
  )
}

export function ShareLink({ url, notice, text }: { url: string; notice: string; text: string }) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* sin permiso de portapapeles: el usuario puede copiarlo a mano */
    }
  }

  return (
    <div className="space-y-3">
      <Alert tone="success">{notice}</Alert>
      <input className="input font-mono text-xs" readOnly value={url} aria-label="Enlace" onFocus={(e) => e.target.select()} />
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-secondary" onClick={copy}>
          {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />} {copied ? 'Copiado' : 'Copiar enlace'}
        </button>
        <a className="btn-secondary" href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener noreferrer">
          <MessageCircle className="size-4" aria-hidden /> Enviar por WhatsApp
        </a>
      </div>
    </div>
  )
}
