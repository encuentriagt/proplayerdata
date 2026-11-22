# ProPlayer Data (ppdguate.com)

- `web/` → se publica en `~/public_html` del servidor (Namecheap, cPanel).
- `api/` → backend Laravel (pendiente) → `~/ppd-api`, subdominio `api.ppdguate.com`.

## Deploy
Cada cambio que entra a `main` dentro de `web/` se publica solo con GitHub Actions
(`.github/workflows/deploy-web.yml`). También se puede lanzar a mano en
Actions > "Deploy web" > Run workflow.

Secrets del repositorio (Settings > Secrets and variables > Actions):
`SSH_HOST`, `SSH_PORT`, `SSH_USER`, `SSH_KEY`, `SSH_KNOWN_HOSTS`.

## Reglas
- Nunca subir `.env`, llaves, `.sql`, `.zip`, `.bak` ni logs.
- Las migraciones de base de datos no corren solas.
