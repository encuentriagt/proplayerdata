/**
 * Marca ProPlayer Data (línea gráfica v1, nov 2026): escudo con cinco estrellas, barras que crecen
 * (la más alta en verde cancha) y tres balones; logotipo en Saira Extra Condensed ExtraBold itálica.
 * Colores: tinta #201E1D, verde cancha #25984D, oro #D28316, cuero #9A5328 (solo el balón), papel #F3F2F2.
 */
import { useId } from 'react'

type MarkProps = { size?: number; className?: string; title?: string; negative?: boolean }

export function ProPlayerMark({ size = 32, className = '', title = 'ProPlayer', negative = false }: MarkProps) {
  const clip = `pp-clip-${useId().replace(/:/g, '')}` // id único si hay varios escudos en la página
  const ink = negative ? '#F3F2F2' : '#201E1D'
  const paper = negative ? '#201E1D' : '#F3F2F2'
  const shield = 'M18 8H82V46C82 69 68 83 50 93C32 83 18 69 18 46Z'
  const star = 'M0 -4.8L1.076 -1.481L4.565 -1.483L1.741 .566L2.821 3.883L0 1.83L-2.821 3.883L-1.741 .566L-4.565 -1.483L-1.076 -1.481Z'
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className={className} role="img" aria-label={title}>
      <defs>
        <clipPath id={clip}><path d={shield} /></clipPath>
      </defs>
      <path d={shield} fill={paper} />
      <g clipPath={`url(#${clip})`} fill={ink}>
        <rect x="27" y="67" width="14" height="42" />
        <rect x="43" y="56" width="14" height="53" />
        <rect x="59" y="43" width="14" height="66" fill="#25984D" />
      </g>
      <g stroke={ink} strokeLinecap="round">
        <g transform="translate(34 60.5) rotate(-35)">
          <path d="M-5.8 0Q0 -7.2 5.8 0Q0 7.2 -5.8 0Z" fill="#9A5328" strokeWidth="1.3" strokeLinejoin="round" />
          <path d="M-2 0H2M-1.2 -.9V.9M0 -.9V.9M1.2 -.9V.9" fill="none" stroke={paper} strokeWidth=".8" />
        </g>
        <g transform="translate(50 49.5)">
          <circle r="4.6" fill={paper} strokeWidth="1.4" />
          <path d="M0 -4.6V4.6M-4.6 0H4.6M-3.3 -3.2Q-1.2 0 -3.3 3.2M3.3 -3.2Q1.2 0 3.3 3.2" fill="none" strokeWidth="1" />
        </g>
        <g transform="translate(66 36.5)">
          <circle r="4.6" fill={paper} strokeWidth="1.4" />
          <path d="M0 -1.9L1.807 -.587L1.117 1.537L-1.117 1.537L-1.807 -.587Z" fill={ink} strokeWidth=".6" />
          <path d="M0 -1.9V-4.6M1.807 -.587L4.375 -1.421M1.117 1.537L2.704 3.721M-1.117 1.537L-2.704 3.721M-1.807 -.587L-4.375 -1.421" fill="none" strokeWidth="1" />
        </g>
      </g>
      <g fill="#D28316">
        {[30, 40, 50, 60, 70].map((x) => <path key={x} d={star} transform={`translate(${x} 17.5)`} />)}
      </g>
      <path d="M18 27H82" stroke={ink} strokeWidth="3.5" />
      <path d={shield} fill="none" stroke={ink} strokeWidth="5" />
    </svg>
  )
}

/** Logotipo: principal horizontal (con "DATA ★ EN VIVO") o reducido (solo "PROPLAYER"). */
export function ProPlayerLogo({ size = 56, reduced = false, negative = false }: { size?: number; reduced?: boolean; negative?: boolean }) {
  const ink = negative ? 'text-paper' : 'text-ink'
  return (
    <span className={`inline-flex items-center ${ink}`} style={{ gap: size * 0.28 }} aria-label="ProPlayer Data · En vivo" role="img">
      <ProPlayerMark size={size} negative={negative} title="" />
      <span aria-hidden className="flex flex-col">
        <span className="num" style={{ fontSize: size * 0.78, letterSpacing: '-0.01em' }}>PROPLAYER</span>
        {!reduced && (
          <span className="font-display font-semibold italic uppercase" style={{ fontSize: size * 0.2, letterSpacing: '0.32em', marginTop: size * 0.06 }}>
            Data <span className="text-ppd-star">★</span> En vivo
          </span>
        )}
      </span>
    </span>
  )
}

/** "Powered by [escudo] ppd": única aparición de la marca dentro de la PC de un colegio (login y pie). */
export function PoweredBy({ className = '' }: { className?: string }) {
  return (
    <p className={`inline-flex items-center gap-1.5 text-xs text-muted ${className}`}>
      Powered by <ProPlayerMark size={16} title="" /> <span className="font-semibold text-ink">ppd</span>
    </p>
  )
}
