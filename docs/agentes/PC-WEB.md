# PARA EL AGENTE DE LA WEB (PC — Plataforma Coach) — NO PEGAR EN LA TERMINAL

Usted construirá la **PC (Plataforma Coach)** de **ppd (ProPlayer Data)**: la web que usan el coach, el director deportivo y el administrador de cada colegio o equipo. El backend ya está terminado y en producción. Lo dirige el agente de backend; cualquier cambio en la API se le pide a él (no se modifica `api/`).

---

## 1. Lea primero (en el repositorio `encuentriagt/proplayerdata`)

1. `docs/ARQUITECTURA.md`: qué es ppd, roles, marca blanca, planes y reglas.
2. `docs/API.md`: **todos los endpoints** con cuerpos y respuestas. Es la referencia para cada pantalla.

Usted trabaja **solo en la carpeta `pc/`**. No toque `api/`, `web/`, `docs/` ni `.github/` (el deploy lo prepara el agente de backend).

---

## 2. Stack (decidido)

- **React + TypeScript + Vite**, **Tailwind CSS**, **TanStack Query** (datos y caché), **React Router**.
- SPA que se compila a archivos estáticos (`pc/dist/`). El servidor es hosting compartido: **no hay Node en producción**.
- Pruebas: **Vitest** (unidades) y **Playwright** (flujo principal: login → equipo → crear partido → convocar → ficha → publicar).
- Sin librerías de UI pesadas. Íconos: `lucide-react`. Fechas: `date-fns` con locale `es`.
- Variables: `VITE_API_URL=https://api.ppdguate.com/api`. En desarrollo use el **proxy de Vite** (`/api` → `https://api.ppdguate.com`), porque la API solo permite CORS desde los dominios de ppd y no desde `localhost`.

Producción: `https://pc.ppdguate.com`. Incluya en `pc/public/.htaccess` (el servidor es LiteSpeed/Apache):
- reescritura de cualquier ruta inexistente a `/index.html` (SPA);
- `Content-Security-Policy` estricta (`default-src 'self'; connect-src 'self' https://api.ppdguate.com; img-src 'self' https://api.ppdguate.com data:; style-src 'self' 'unsafe-inline'; font-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`), `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` mínima;
- caché larga para `/assets/*` (archivos con hash) y `no-cache` para `index.html`.

Fuentes de la marca ppd (Saira y Saira Extra Condensed) **empaquetadas en el build**, no desde Google Fonts (por la CSP).

---

## 3. Reglas que no se rompen

- **Textos en español de Guatemala, trato de usted** ("Ingrese su correo", "Guarde los cambios").
- **Marca blanca**: toda la interfaz toma el logo y los colores de la organización (ver §5). ppd solo aparece como "Powered by ppd" en el login y en el pie.
- **Seguridad**:
  - El token va en `sessionStorage` (se borra al cerrar la pestaña) o, si el usuario marca "Mantener sesión", en `localStorage`. Nunca en cookies propias ni en la URL.
  - Encabezados en cada petición: `Authorization: Bearer <token>`, `Accept: application/json`, y en el login `X-App-Platform: web`.
  - 401 → borrar el token y llevar al login de la organización. 403 → mostrar `error.message`.
  - Nunca `dangerouslySetInnerHTML` con datos de la API. Nada de secretos en el código.
- **Idempotencia**: en las rutas ♻️ de `docs/API.md` envíe `Idempotency-Key` con un UUID **por acción del usuario** (`crypto.randomUUID()`). Si la red falla y se reintenta, se usa **la misma** clave. Deshabilite el botón mientras se envía.
- **Errores**: decida por `error.code` (estable) y muestre `error.message`. Para `validation_failed`, pinte `error.fields` debajo de cada campo.
- **Permisos**: la API decide. La PC oculta lo que el rol no puede hacer, pero nunca confía en eso.
- **Fotos de jugadores**: `photo_url` vence en 15 minutos. No la guarde; vuelva a pedir el jugador si hace falta.
- **No hay partido en tiempo real**: el coach llena la **ficha al terminar** el partido.
- **Responsive**: el coach usa la PC en el celular en la cancha (asistencia y ficha) y en la computadora para planificar. Diseñe primero para el celular.
- **Accesibilidad**: contraste AA con los colores de cada organización (si el color primario no da contraste, use `on_primary`), etiquetas en los formularios y navegación con teclado.

---

## 4. Rutas de la PC

| Ruta | Pantalla |
|---|---|
| `/` | Si no hay sesión: "Ingrese a través del enlace de su institución" + buscador por `slug`. Con sesión y varias organizaciones: elegir organización |
| `/:slug/login` | Login con la marca de la organización (`GET /public/orgs/{slug}/branding`). Si `active=false`: "Su organización no está activa. Comuníquese con su institución." |
| `/:slug/invitacion?token=` | Aceptar invitación: `GET /public/invitations/{token}`; si `user_exists` pide solo la contraseña, si no: nombre + contraseña + confirmación |
| `/:slug/cambiar-contrasena` | Obligatoria si `must_change_password=true` |
| `/:slug` | Inicio: próximos eventos de sus equipos, resultados pendientes de ficha, accesos rápidos |
| `/:slug/calendario` | Mes/semana/lista. Filtros por equipo y tipo |
| `/:slug/eventos/nuevo` y `/:slug/eventos/:id` | Crear o editar; pestañas **Convocatoria**, **Asistencia** y **Ficha** (solo partidos) |
| `/:slug/equipos` y `/:slug/equipos/:id` | Lista; detalle con plantilla (dorsal, posición, activo) y staff |
| `/:slug/jugadores` y `/:slug/jugadores/:id` | Búsqueda; ficha del jugador (foto, datos, equipos, padres), invitar a un padre |
| `/:slug/admin/...` | Solo `org_admin`: **Miembros** (invitar coach/director/admin y asignar equipos), **Equipos** (crear y editar, asignar staff), **Temporadas**, **Planes** (asignar Pro/Premium a padres y ver el uso del cupo), **Marca** (si `branding_editable_by_org`), **Invitaciones pendientes** |

Menú según rol (de `memberships[].role` en `/auth/me`): coach → Inicio, Calendario, Equipos, Jugadores · director → lo mismo para todos los equipos · admin → todo + Administración.

---

## 5. Marca blanca (cómo implementarla)

1. Al entrar a `/:slug/...` pida `GET /public/orgs/{slug}/branding` (cachéelo y respete el `ETag`).
2. Ponga en `:root` las variables CSS `--org-primary`, `--org-secondary`, `--org-on-primary` y úselas en Tailwind (`bg-[var(--org-primary)]`).
3. Logo/escudo en el encabezado y el login; `cover_url` como fondo del login si existe.
4. Si la organización no tiene logo, muestre las iniciales con el color primario.
5. Estado inicial y sin organización: marca ppd. Fondo `#F3F2F2`, texto `#201E1D`, verde `#25984D`, estrella `#D28316`; títulos en Saira Extra Condensed itálica, texto en Saira.

---

## 6. Pantallas clave (detalle)

**Calendario**: `GET events?from&to` (máx. 120 días). Colores por tipo: partido, entrenamiento, otro. Estado: programado, finalizado (con marcador) y cancelado (tachado). Crear: `POST events` con selector de equipo (solo los suyos), tipo, fecha y hora (Guatemala), lugar, rival y local/visita.

**Convocatoria** (`PUT events/{id}/callups`): lista de la plantilla activa con casillas "Convocado" y "Reserva". Al guardar, la API avisa a los padres de los nuevos convocados. Muestre la respuesta de cada padre (`guardian_response`: pendiente, confirmado, no asistirá).

**Asistencia** (`PUT events/{id}/attendance`): un toque por jugador para presente, tarde, ausente o excusa. Botón "Todos presentes". Debe ser rápida en el celular.

**Ficha del partido** (`PUT events/{id}/match-sheet`), la pantalla más importante:
- Marcador (nosotros / rival).
- Alineación: jugadores de la plantilla, titular o suplente, posición (del deporte del equipo), dorsal y minutos jugados.
- Estadísticas por jugador: botones **+ / −** por cada `stat_type` del deporte (de `GET /catalog/sports` o `GET teams/{id}`), por ejemplo Gol, Asistencia, Amarilla, Roja en fútbol; Tiro libre, Doble, Triple, Rebote en básquet. Cada toque es una acción `{stat_code, player_id}`; minuto y periodo son opcionales.
- Cambios (opcional): entra / sale con minuto.
- Botones **"Guardar borrador"** (`publish:false`) y **"Publicar resultado"** (`publish:true`). Antes de publicar, confirmar: "Se enviará el resultado a los padres. ¿Desea continuar?".
- Si la respuesta trae `warnings`, mostrarlos como aviso amarillo (no bloquean).
- Se puede corregir después; si cambia el marcador, la API avisa "Resultado corregido".
- Guarde el borrador también en `localStorage` del navegador mientras se edita, por si se pierde la señal en la cancha.

**Jugadores**: crear (nombre, apellidos, fecha de nacimiento, género, documento opcional, notas), foto (jpg/png/webp ≤ 3 MB, recortar a cuadrado antes de subir) y agregar a un equipo. Botón "Invitar a padre o madre" (`POST invitations` con `role: guardian`, `player_id`): muestre `invite_url` con un botón "Copiar enlace" y otro "Enviar por WhatsApp" (`https://wa.me/?text=...`), porque el correo todavía puede no estar activo.

**Administración (org_admin)**:
- Miembros: lista con rol, estado y equipos; invitar (correo, rol, equipos si es coach) → mostrar `invite_url`; desactivar y reactivar.
- Planes: barra de uso del cupo (`meta.usage`), asignar por correo del padre (Pro o Premium, vencimiento opcional) y revocar. **Sin precios** en ninguna parte.

---

## 7. Entrega

- Código en `pc/` con `README.md` (cómo correr y compilar, variables).
- `npm run build` debe generar `pc/dist/` con `index.html`, `.htaccess` y `assets/`.
- `npm run test` (Vitest) y `npm run e2e` (Playwright) deben pasar.
- Trabaje en una rama `pc/...` y abra un Pull Request a `main`. El agente de backend revisa y agrega el deploy automático a `pc.ppdguate.com`.
- Si necesita algo de la API que no está en `docs/API.md`, escríbalo en el PR o pídalo al dueño, en lugar de inventarlo.

Datos de prueba: el agente de backend creará la organización **"Colegio Demo ppd"** (slug `colegio-demo`) con un admin, un coach, equipos y jugadores, y le pasará los accesos por un medio seguro.
