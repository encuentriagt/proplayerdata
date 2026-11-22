// El token vive en sessionStorage (se borra al cerrar la pestaña) o, con "Mantener sesión", en localStorage.
// Nunca en cookies propias ni en la URL.
const KEY = 'ppd.pc.token'
const ORG_KEY = 'ppd.pc.lastOrg'

export function getToken(): string | null {
  return sessionStorage.getItem(KEY) ?? localStorage.getItem(KEY)
}

export function setToken(token: string, remember: boolean): void {
  clearToken()
  ;(remember ? localStorage : sessionStorage).setItem(KEY, token)
}

export function clearToken(): void {
  sessionStorage.removeItem(KEY)
  localStorage.removeItem(KEY)
}

export function getLastOrg(): string | null {
  return localStorage.getItem(ORG_KEY)
}

export function setLastOrg(slug: string): void {
  localStorage.setItem(ORG_KEY, slug)
}
