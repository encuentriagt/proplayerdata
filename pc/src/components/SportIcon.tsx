/**
 * Íconos de deporte de línea (diseño), con los mismos balones del escudo ProPlayer.
 * Heredan el color del texto (currentColor). Códigos del catálogo en inglés; se aceptan los anteriores en español.
 */
const ALIAS: Record<string, string> = {
  futbol: 'soccer', futbol_sala: 'futsal', basquetbol: 'basketball', voleibol: 'volleyball', futbol_americano: 'american_football', beisbol: 'baseball',
}

export function SportIcon({ code, size = 20, className = '' }: { code?: string | null; size?: number; className?: string }) {
  const c = ALIAS[code ?? ''] ?? code ?? ''
  const common = { width: size, height: size, viewBox: '-12 -12 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, className, 'aria-hidden': true }
  if (c === 'soccer' || c === 'futsal') {
    return (
      <svg {...common}>
        <circle r="10" />
        <path d="M0 -4L3.8 -1.2L2.35 3.25L-2.35 3.25L-3.8 -1.2Z" fill="currentColor" strokeWidth="1" />
        <path d="M0 -4V-10M3.8 -1.2L9.5 -3.1M2.35 3.25L5.9 8.1M-2.35 3.25L-5.9 8.1M-3.8 -1.2L-9.5 -3.1" />
      </svg>
    )
  }
  if (c === 'basketball') {
    return (
      <svg {...common}>
        <circle r="10" />
        <path d="M0 -10V10M-10 0H10M-7.2 -7Q-2.6 0 -7.2 7M7.2 -7Q2.6 0 7.2 7" />
      </svg>
    )
  }
  if (c === 'american_football') {
    return (
      <svg {...common}>
        <g transform="rotate(-35)">
          <path d="M-11 0Q0 -9 11 0Q0 9 -11 0Z" />
          <path d="M-4 0H4M-2.4 -1.6V1.6M0 -1.6V1.6M2.4 -1.6V1.6" />
        </g>
      </svg>
    )
  }
  if (c === 'volleyball' || c === 'beach_volleyball') {
    return (
      <svg {...common}>
        <circle r="10" />
        <path d="M0 0L0 -10M0 0L8.7 5M0 0L-8.7 5M0 -10Q6 -4 8.7 5M8.7 5Q0 7 -8.7 5M-8.7 5Q-6 -4 0 -10" />
      </svg>
    )
  }
  if (c === 'baseball' || c === 'softball') {
    return (
      <svg {...common}>
        <circle r="10" />
        <path d="M-6 -8Q-2 0 -6 8M6 -8Q2 0 6 8" />
      </svg>
    )
  }
  // Deporte sin ícono propio: medalla
  return (
    <svg {...common}>
      <circle cy="3" r="6.5" />
      <path d="M-4 -3.5L-7 -11H-2L0 -6L2 -11H7L4 -3.5" />
    </svg>
  )
}
