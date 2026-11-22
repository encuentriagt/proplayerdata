// Contraste WCAG para elegir el color de texto sobre el primario de cada organización.
export const PPD = {
  bg: '#F3F2F2',
  ink: '#201E1D',
  green: '#25984D',
  star: '#D28316',
} as const

const HEX = /^#?([0-9a-f]{6})$/i

export function isHex(v: unknown): v is string {
  return typeof v === 'string' && HEX.test(v)
}

function luminance(hex: string): number {
  const m = HEX.exec(hex)
  if (!m) return 0
  const n = parseInt(m[1], 16)
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2]
}

export function contrast(a: string, b: string): number {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (l1 + 0.05) / (l2 + 0.05)
}

/** Texto sobre el primario: usa on_primary si da contraste AA (4.5); si no, blanco o casi negro. */
export function readableOn(bg: string, preferred?: string | null): string {
  if (isHex(preferred) && contrast(bg, preferred) >= 4.5) return preferred
  return contrast(bg, '#FFFFFF') >= contrast(bg, PPD.ink) ? '#FFFFFF' : PPD.ink
}

/** Color del primario usado como texto/borde sobre fondo claro: si no da 3:1, se oscurece a la tinta ppd. */
export function accentOnLight(primary: string, bg = '#FFFFFF'): string {
  return contrast(primary, bg) >= 3 ? primary : PPD.ink
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter((w) => w.length > 2 || /^[A-ZÁÉÍÓÚÑ]/.test(w))
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('') || name.slice(0, 2).toUpperCase()
}
