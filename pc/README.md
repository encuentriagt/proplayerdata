# PC — Plataforma Coach (ppd)

Web del coach, el director deportivo y el administrador de cada organización. SPA en React + TypeScript + Vite + Tailwind 4 + TanStack Query + React Router, compilada a archivos estáticos para `https://pc.ppdguate.com`.

Referencias: `docs/agentes/PC-WEB.md`, `docs/ARQUITECTURA.md`, `docs/API.md`.

## Requisitos

- Node 22 o superior
- pnpm 11 (`corepack enable` lo instala según `packageManager` en `package.json`)

## Comandos

| Comando | Qué hace |
|---|---|
| `pnpm install` | Instala dependencias |
| `pnpm dev` | Servidor de desarrollo en `http://localhost:5173` |
| `pnpm build` | Revisa tipos y genera `dist/` (`index.html`, `.htaccess`, `assets/`) |
| `pnpm preview` | Sirve `dist/` localmente |
| `pnpm test` | Pruebas unitarias (Vitest) |
| `pnpm e2e` | Flujo principal en celular y escritorio (Playwright). La primera vez: `pnpm exec playwright install chromium` |

## Variables

| Variable | Desarrollo | Producción |
|---|---|---|
| `VITE_API_URL` | `/api` (por defecto) | `https://api.ppdguate.com/api` (por defecto en el build; el workflow también la define) |

En desarrollo, el proxy de Vite reenvía `/api` a `https://api.ppdguate.com`, porque la API solo acepta CORS desde los dominios de ppd. Use `.env.local` para cambiarla (no se sube al repositorio).

Las pruebas e2e **no** llaman a la API real: `e2e/mockApi.ts` la simula con las mismas respuestas que documenta `docs/API.md`.

## Estructura

```
src/
  lib/          api (token, errores, idempotencia), auth, marca blanca, fechas (Guatemala), consultas, lógica de la ficha
  components/   UI base, layout de la organización, diálogos
  pages/        pantallas (event/ = pestañas del evento, admin/ = Administración)
public/.htaccess          SPA + CSP y encabezados de seguridad
public/assets/.htaccess   caché de un año para archivos con hash
```

## Reglas que sigue el código

- Token en `sessionStorage`, o en `localStorage` con "Mantener sesión". 401 → se borra y se vuelve al login.
- Rutas ♻️ con `Idempotency-Key` (`crypto.randomUUID()`), una por acción del usuario; los reintentos por red reusan la misma.
- Errores por `error.code`; se muestra `error.message` y `error.fields` bajo cada campo.
- Marca blanca con `--org-primary`, `--org-secondary`, `--org-on-primary` y `--org-accent`. Si `on_primary` no da contraste AA, se usa blanco o tinta según convenga.
- Fechas siempre en hora de Guatemala (UTC−6), sin importar la zona del navegador.
- La ficha del partido se guarda también en `localStorage` mientras se edita y se borra al guardarla en la API.
- Fuentes Saira empaquetadas (subconjunto latino) por la CSP.
