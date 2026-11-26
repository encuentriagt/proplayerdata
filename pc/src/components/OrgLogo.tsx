import { initials } from '../lib/color'
import type { Branding } from '../lib/types'

/** Logo o escudo de la organización; si no tiene, sus iniciales sobre el color primario. */
/** `onPrimary`: el logo va sobre el color primario (encabezado), así que las iniciales se invierten. */
export function OrgLogo({ org, size = 40, onPrimary = false }: { org: Pick<Branding, 'name' | 'logo_url' | 'crest_url'>; size?: number; onPrimary?: boolean }) {
  const src = org.logo_url ?? org.crest_url
  if (src) {
    return <img src={src} alt={org.name} className="shrink-0 rounded-full bg-white object-contain" style={{ width: size, height: size }} />
  }
  return (
    <span
      role="img"
      aria-label={org.name}
      className={`grid shrink-0 place-items-center rounded-full font-display font-extrabold italic ${onPrimary ? 'bg-on-org text-org' : 'bg-org text-on-org'}`}
      style={{ width: size, height: size, fontSize: size * 0.42 }}
    >
      {initials(org.name)}
    </span>
  )
}

export { PoweredBy } from './Brand'
