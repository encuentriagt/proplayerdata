# ppd (ProPlayer Data) — Arquitectura v1.3

Versión 1.3 · 2026-11-21 (SIN partido en vivo: el coach llena la ficha al final; aviso a padres al guardar) · Autor: agente de backend (dirige el proyecto)
Este documento es la fuente de verdad para TODOS los agentes (web, Flutter, diseño, panel).
Si algo aquí cambia, se cambia primero en este archivo.

---

## 1. Qué es ppd

Plataforma multideporte para colegios y equipos (de cualquier deporte), con marca blanca.

| Nombre corto | Qué es | Quién lo usa | Dónde |
|---|---|---|---|
| **ppd** | El producto completo (ProPlayer Data) | — | ppdguate.com |
| **PC** | Plataforma Coach (web): eje del sistema | Coach, director deportivo, admin de organización | pc.ppdguate.com |
| **Panel** | Panel de administración de ppd | Super admin (dueño de ppd) | admin.ppdguate.com |
| **App** | App de padres (Android e iOS, Flutter) | Padres / encargados | Google Play y App Store |
| **API** | Backend Laravel, único punto de datos | Todos los anteriores | api.ppdguate.com |

Slogan: "En vivo" (es solo marca: **no hay registro de partido en tiempo real**). Idioma: español de Guatemala, trato de **usted** en todos los textos.

---

## 2. Roles y permisos

| Rol | Dónde entra | Puede |
|---|---|---|
| `super_admin` | Panel | Crear/editar/suspender organizaciones, su marca blanca, sus admins, sus cupos de planes; asignar planes Pro/Premium a cualquier padre; ver todo; auditoría. |
| `org_admin` | PC | Administrar SU organización: equipos, deportes, temporadas, coaches, directores, jugadores, padres, asignar planes dentro de su cupo, editar su marca (si el super admin lo permite). |
| `director` | PC | Ver TODOS los deportes y equipos de su organización (lectura + reportes). Puede registrar lo mismo que un coach. |
| `coach` | PC | Ver y trabajar SOLO en los equipos que la organización le asignó (y por lo tanto solo esos deportes). |
| `guardian` (padre) | App | Ver la información de SUS hijos según su plan (Gratis / Pro / Premium). |

Reglas:
- Un usuario puede tener roles en varias organizaciones (tabla `organization_members`).
- Un coach puede tener varios equipos; un equipo puede tener varios coaches (`team_staff`).
- Un padre puede tener varios hijos, incluso en organizaciones distintas.
- TODA consulta de la API filtra por organización y por asignación. Nunca confiar en lo que mande el cliente.
- Organización suspendida → nadie de esa organización entra (ni PC ni App); se muestra "Su organización no está activa. Comuníquese con su institución."

---

## 3. Planes de los padres (Gratis / Pro / Premium)

| Plan | Alcance |
|---|---|
| **Gratis** | Todas las funciones, con límites (ver `config/plans.php`, valores por definir). |
| **Pro** | Todo sin límites, para **1 hijo** (el padre elige cuál; cambio limitado). |
| **Premium** | Todo sin límites, todos sus hijos. |

- El plan es **por padre**.
- **Nadie paga dentro de la app.** El dueño de ppd cobra a la organización por fuera; la organización cobra a las familias como quiera.
- Quién asigna planes: **ambos**
  - `super_admin` desde el Panel (a cualquier padre, sin consumir cupo, o consumiendo el de una organización).
  - `org_admin` desde PC, dentro del **cupo** que el super admin le dio a su organización (ej. 40 Premium, 25 Pro).
- Base legal en tiendas: Apple 3.1.3(c) (servicio vendido a organizaciones para sus estudiantes). Por eso:
  - **En la App NO puede aparecer**: precios, "comprar", "suscribirse", "mejorar plan", enlaces a pagos, ni mención de que se cobra.
  - La App solo muestra: "Plan Premium — asignado por <Organización>". En Gratis, al tocar un límite: "Esta función tiene un límite en su plan actual. Consulte con su institución." (sin más).
  - Los mensajes del servidor (push, correo) tampoco mencionan cobros.
- Tabla `plan_grants` (idea copiada de `premium_grants` de Trafidoc): un solo lugar (`PlanService::effectivePlan($user)`) decide el plan vigente.

---

## 4. Marca blanca

Cada organización tiene: nombre, `slug`, logo (PNG/SVG), escudo opcional, color primario, color secundario, color de texto sobre primario, imagen de portada opcional.

- **PC**: `pc.ppdguate.com/<slug>` muestra el login con la marca de la organización; adentro, toda la interfaz con sus colores y logo.
- **App**: UNA sola app "ppd" en tiendas. Tras el login se pinta con la marca de la organización del hijo seleccionado. Si hay hijos en varias organizaciones, selector arriba.
- ppd aparece discreto: "Powered by ppd" en login y pie.
- No se publican apps separadas por colegio (Apple 4.2.6 rechaza apps de plantilla no publicadas por el dueño del contenido). Si un colegio lo exige, servicio aparte y con SU cuenta de Apple.
- Endpoint público: `GET /api/public/orgs/{slug}/branding` → nombre, logo_url, colores.
- Archivos de marca en `storage/app/public/orgs/{id}/` (públicos, sin datos personales).

---

## 5. Deportes (multideporte)

Catálogo administrado desde el Panel (no código):
- `sports`: fútbol, fútbol sala, básquetbol, voleibol, fútbol americano, béisbol, etc.
- `sport_positions`: posiciones por deporte (POR, DEF, MED, DEL / Base, Escolta, Alero… ).
- `sport_stat_types`: estadísticas por deporte, con:
  - `code` (goal, assist, yellow_card, red_card, point_1, point_2, point_3, rebound, foul, …)
  - `scores` (cuánto suma al marcador; 0 si no suma)
  - `is_player_stat`, `is_team_stat`
- `sport_settings`: duración y cantidad de periodos, si hay cambios ilimitados, etc.

La PC y la App leen el catálogo; NO hay lógica fija por deporte en el cliente.

---

## 6. Modelo de datos (MariaDB, **InnoDB obligatorio**)

Convenciones: `id` BIGINT, `created_at/updated_at`, borrado lógico (`deleted_at`) donde se indica, fechas en `America/Guatemala`.

**Organización y personas**
- `organizations` (name, slug único, type: school|team, status: active|suspended, logo_path, crest_path, cover_path, color_primary, color_secondary, color_on_primary, quota_pro, quota_premium, branding_editable_by_org bool, notes, deleted_at)
- `users` (name, email único, password nullable, phone, google_sub, apple_sub, apple_refresh_token cifrado, is_super_admin, totp_secret cifrado, last_login_at, deleted_at)
- `organization_members` (organization_id, user_id, role: org_admin|director|coach, status: active|invited|disabled) — único (org, user, role)
- `invitations` (organization_id, email, role: org_admin|director|coach|guardian, player_id nullable, token_hash, expires_at, accepted_at, created_by)

**Equipos y jugadores**
- `seasons` (organization_id, name, starts_on, ends_on, is_current)
- `teams` (organization_id, sport_id, season_id, name, category, gender, color, deleted_at)
- `team_staff` (team_id, user_id, role: head_coach|assistant) — define qué ve cada coach
- `players` (organization_id, first_name, last_name, birthdate, photo_path, document_number nullable, notes, deleted_at)
- `team_players` (team_id, player_id, jersey_number, sport_position_id, active)
- `guardian_players` (user_id, player_id, relationship, verified_at)

**Calendario y actividad**
- `events` (organization_id, team_id, type: match|training|other, title, starts_at, ends_at, location, opponent_name, home_away, status: scheduled|finished|cancelled, score_us, score_them, result_published_at, notes, created_by, deleted_at)
- `event_callups` (event_id, player_id, status: called|reserve, guardian_response: pending|confirmed|declined, responded_at)
- `attendances` (event_id, player_id, status: present|absent|late|excused, note, recorded_by)
- `match_lineups` (event_id, player_id, is_starter, sport_position_id, jersey_number)
- `match_actions` (event_id, period, minute nullable, type: stat|sub_in|sub_out|note, sport_stat_type_id nullable, player_id nullable, related_player_id nullable, value, recorded_by) — detalle de la **ficha del partido** que el coach llena al terminar (goles/puntos, tarjetas, cambios). No es en tiempo real.
- `player_event_stats` (event_id, player_id, minutes_played, stats JSON) — resumen recalculado al cerrar o editar el partido.

**Planes, avisos, auditoría**
- `plan_grants` (user_id, organization_id nullable, plan: pro|premium, pro_player_id nullable, source: super_admin|org_admin, granted_by, starts_at, ends_at nullable, revoked_at, note)
- `devices` (user_id, platform: android|ios|web, fcm_token, last_seen_at)
- `notification_logs` (user_id, kind, ref_type, ref_id, sent_at) — para no repetir avisos
- `audit_log` (actor_user_id, organization_id, action, target_type, target_id, data JSON, ip, created_at)

---

## 7. API (Laravel 13, `api.ppdguate.com`)

- Laravel 13 sobre PHP 8.5. Autenticación: Laravel Sanctum (tokens). Una sesión por plataforma (encabezado `X-App-Platform: web|android|ios`), idea de Trafidoc.
- PC: correo + contraseña (invitación por correo). Opcional Google.
- App: correo + contraseña, Google y **Sign in with Apple** (obligatorio si hay Google). Borrado de cuenta dentro de la app con revocación del token de Apple (copiar idea de Trafidoc).
- Panel: correo + contraseña + TOTP, bloqueo por intentos, sesión corta.
- Prefijos:
  - `/api/public/*` (branding, salud)
  - `/api/auth/*`
  - `/api/pc/*` (coach, director, org_admin; cada ruta valida organización + asignación)
  - `/api/app/*` (padres; valida vínculo con el hijo + plan)
  - `/api/admin/*` (super admin)
- **Ficha del partido (no hay tiempo real)**: el coach llena la ficha completa al terminar el partido (marcador, alineación, minutos, goles/puntos, tarjetas, cambios) y la guarda con un solo envío (`PUT /api/pc/events/{id}/match-sheet`, idempotente). Puede corregirla después.
- **Aviso a los padres al guardar**: al publicar la ficha, la API envía el resultado a los padres de los jugadores del equipo por push. Se envía **en el mismo momento, después de responder al coach** (Laravel `afterResponse`), sin cola ni tarea programada. Si el coach corrige la ficha, no se repite el aviso salvo que cambie el marcador (`result_published_at` + `notification_logs`).
- Respuestas JSON en español para mensajes al usuario. Errores con `code` estable para que los clientes traduzcan/decidan.
- CORS solo: ppdguate.com, pc.ppdguate.com, admin.ppdguate.com (y orígenes locales de desarrollo).

---

## 8. Servidor y repositorio

Servidor: Namecheap shared hosting, cPanel usuario `ppdgmmle`, `server292.web-hosting.com`, IP 162.0.235.5, SSH puerto 21098, PHP 8.5 (CloudLinux "Select PHP Version", cuenta completa), MariaDB 11.4, DNS del hosting (dns1/dns2.namecheaphosting.com: los registros se editan en cPanel > Zone Editor). BD `ppdgmmle_ppd`, usuario `ppdgmmle_ppdapp` (credenciales solo en `~/ppdback/.db_credentials`, 600). Reglas heredadas del proyecto anterior (Trafidoc): MyISAM por defecto → `'engine' => 'InnoDB'` antes de migrar; cron solo con el método de archivo; sin secretos en el repo; `APP_DEBUG=false`.

| Carpeta en servidor | Contenido | Origen en repo |
|---|---|---|
| `~/public_html` | Página pública ppdguate.com | `web/` (deploy automático) |
| `~/ppd-api` | Laravel. api.ppdguate.com tiene document root `~/api.ppdguate.com`, que es un **enlace** a `~/ppd-api/public` (el subdominio se creó desde cPanel > Domains para que Namecheap emita el SSL gratis; no borrar el enlace) | `api/` |
| `~/pc.ppdguate.com` | Build estático de la PC | `pc/` (se construye en GitHub Actions) |

**SSL**: los subdominios se crean SIEMPRE desde **cPanel > Domains > Create A New Domain**; así Namecheap instala el StandardSSL gratis solo. Creados por terminal (uapi) no reciben SSL.
| `~/admin.ppdguate.com` | Build estático del Panel | `admin/` |
| `~/ppdback` (700) | Respaldos, crontab, known_hosts | — |
| `~/ppd_test` (700) | Scripts de pruebas en servidor | — |

Repositorio `encuentriagt/proplayerdata` (monorepo): `web/`, `api/`, `pc/`, `admin/`, `app/` (Flutter), `docs/`.
- Deploy: GitHub Actions por SSH al entrar a `main`. `.env`, `storage/` y llaves NUNCA se suben ni se sobrescriben.
- Migraciones: solo a mano (workflow manual) y con respaldo previo.

---

## 9. Etapas

| Etapa | Entrega | Responsable |
|---|---|---|
| E0 | Hosting, SSL, página "En construcción", deploy automático | Backend ✅ |
| E1 | API base: Laravel, InnoDB, auth, organizaciones, marca blanca, miembros, invitaciones, auditoría, respaldo diario | Backend |
| E2 | Panel (super admin): organizaciones, marca, cupos, deportes, planes | Agente del panel + Backend |
| E3 | PC: login con marca, equipos, jugadores, staff, padres, asignación de planes | Agente de la web + Backend |
| E4 | PC: calendario, partidos, entrenamientos, convocatorias, asistencia | Agente de la web + Backend |
| E5 | PC: ficha del partido al final (alineación, minutos, goles/puntos, tarjetas, cambios, marcador) + aviso a padres | Agente de la web + Backend |
| E6 | App padres: login, hijos, calendario, convocatorias, asistencia, estadísticas, resultados de partidos, push, planes | Agente de Flutter + Backend |
| E7 | Tiendas: cuenta demo, capturas, video, revisión Apple/Google | Todos |

---

## 10. Pendientes por definir (dueño del proyecto)

1. Límites exactos del plan Gratis (ej. historial de N días, N hijos, estadísticas básicas).
2. Deportes y posiciones de arranque.
3. ¿El `org_admin` puede editar su propia marca o solo el super admin?
4. Cuenta de Apple Developer y Google Play que publicará la App.
5. Datos de contacto/soporte que aparecerán (soporte@ppdguate.com).

---

## 11. Reglas para todos los agentes

- Leer este documento antes de escribir código. Cambios de alcance → se actualiza aquí primero.
- Ningún cliente (PC, Panel, App) guarda llaves ni secretos.
- Textos con trato de **usted**, español de Guatemala.
- En la App: cero menciones de precios o pagos (sección 3).
- Toda pantalla toma colores/logo de la marca de la organización (sección 4); ppd solo como "Powered by ppd".
- Los clientes no deciden permisos: la API responde 403 y el cliente muestra el mensaje.

---

## 12. Seguridad e idempotencia (obligatorio en TODO el proyecto)

**Principios**
- Mínimo privilegio: cada rol ve solo lo suyo; autorización en la API con Policies de Laravel en cada ruta (nunca en el cliente).
- Aislamiento por organización: todo query de datos de una organización lleva `organization_id` del usuario autenticado; pruebas automáticas que intentan leer datos de otra organización (deben dar 403/404).
- Validación de toda entrada con Form Requests; nada de `$request->all()` a modelos; `$fillable` explícito.
- Contraseñas con bcrypt/argon2 (Laravel por defecto), mínimo 10 caracteres, verificación contra listas de contraseñas filtradas.
- Rate limiting: login, recuperación de contraseña, invitaciones, códigos de vínculo padre-hijo, endpoints públicos.
- Bloqueo progresivo tras intentos fallidos; TOTP obligatorio para super admin y recomendado para org_admin.
- Tokens Sanctum con expiración; revocación al cambiar contraseña, al suspender organización o al quitar un rol.
- Datos sensibles cifrados en reposo (`encrypted` cast): datos médicos, tokens de Apple, secretos TOTP, documento de identidad.
- Archivos: validar tipo real (MIME por contenido) y tamaño; renombrar con UUID; fotos de menores y datos privados en `storage/app/private` servidos solo por endpoint autorizado con URL firmada de corta duración; nunca listables.
- Datos de menores: minimizar lo que se pide; el padre/encargado ve solo a sus hijos; los coaches solo a jugadores de sus equipos; sin perfiles públicos de jugadores.
- Encabezados de seguridad en web/PC/Panel: HSTS, CSP, X-Frame-Options/frame-ancestors, X-Content-Type-Options, Referrer-Policy, Permissions-Policy.
- CORS cerrado a los dominios propios; cookies `Secure`, `HttpOnly`, `SameSite`.
- `APP_DEBUG=false`; errores sin trazas al cliente; logs sin contraseñas, tokens ni datos médicos.
- Auditoría (`audit_log`) de: logins, cambios de rol, asignación/revocación de planes, cambios de marca, exportaciones, activación/cierre de emergencias, accesos a datos médicos.
- Dependencias: `composer audit` / `npm audit` en GitHub Actions; actualizaciones de seguridad prioritarias.
- Secretos solo en `.env` del servidor y en GitHub Secrets; nunca en el repo ni en el chat.
- Respaldo diario cifrado de BD + storage, rotación 7 días, prueba de restauración periódica.

**Idempotencia**
- Todo `POST` que crea algo o tiene efectos (crear evento, registrar acción de partido, convocar, asignar plan, invitar, activar emergencia, enviar notificación) acepta el encabezado `Idempotency-Key` (UUID generado por el cliente).
  - Tabla `idempotency_keys` (user_id, key, route, request_hash, response_code, response_body, created_at; único user_id+key; caduca a las 24 h).
  - Misma clave + mismo contenido → se devuelve la respuesta guardada sin repetir el efecto. Misma clave + contenido distinto → 422.
- Ficha del partido: se guarda completa en una sola transacción; guardar dos veces la misma ficha no duplica acciones ni avisos.
- Operaciones de estado con transacciones y bloqueo de fila (`lockForUpdate`) — requiere InnoDB.
- Comandos del cron y jobs reentrantes: si se ejecutan dos veces, no duplican (marcas en `notification_logs`, `ShouldBeUnique`, banderas de estado).
- Pagos/planes: asignar un plan dos veces no crea dos grants vigentes.

---

## 13. Módulo de emergencia (se construye después; el diseño lo contempla desde ya)

**Objetivo**: si un coach/director activa una emergencia sobre un jugador (lesión, accidente, malestar), TODOS sus padres/encargados vinculados reciben avisos push insistentes hasta que alguien confirme.

**Flujo**
1. Coach (PC o, más adelante, app del coach) toca "Emergencia" en el perfil del jugador → confirma (doble paso para evitar toques accidentales) → elige tipo y nota corta opcional y ubicación (evento actual o texto).
2. API crea `emergencies` (idempotente con `Idempotency-Key`; si ya hay una abierta para ese jugador, devuelve la existente).
3. Envío inmediato a todos los dispositivos de todos los encargados del jugador + al director/org_admin.
4. Repetición cada N minutos (configurable, ej. 1–2 min) hasta que un encargado toque "Recibido" (ACK) o se cierre la emergencia; luego aviso "Confirmado por <nombre>" a los demás.
5. Si nadie confirma en X minutos → escalar: avisar al director/org_admin y, a futuro, SMS o llamada (proveedor por definir).
6. Cierre por coach/director con nota; todo queda en `audit_log`.

**Notificaciones insistentes por plataforma**
- Android: FCM prioridad alta, canal de notificación propio "Emergencias" con sonido de alarma, vibración, importancia máxima y pantalla completa (full-screen intent, requiere permiso en Android 14+).
- iOS: `interruption-level: time-sensitive` (requiere capacidad Time Sensitive). Para que suene aun en silencio/No molestar hace falta el permiso **Critical Alerts**, que Apple otorga solo con solicitud especial y justificación; se pedirá cuando el módulo exista.
- La App muestra pantalla de emergencia a pantalla completa al abrirse con botón "Recibido" y botón para llamar al coach/colegio.
- El push de emergencia NO depende del plan: funciona igual en Gratis, Pro y Premium.

**Datos (borrador)**
- `emergencies` (organization_id, player_id, event_id nullable, type, note cifrada, location_text, status: open|acknowledged|closed, opened_by, opened_at, acknowledged_by, acknowledged_at, closed_by, closed_at, close_note cifrada, escalated_at)
- `emergency_deliveries` (emergency_id, user_id, device_id, attempt, sent_at, fcm_message_id, error)
- `player_medical` (player_id, blood_type, allergies, conditions, medications, emergency_contacts JSON, insurance) — TODO cifrado; visible solo para staff asignado y encargados; cada lectura queda en `audit_log`.

**Restricciones del hosting a validar antes de construirlo**
- El cron de cPanel permite intervalos de minutos; la repetición se hará con un comando programado (y/o cola) reentrante. Si el intervalo mínimo no alcanza, evaluar un servicio externo de colas/notificaciones.
- FCM HTTP v1 con cuenta de servicio (llave solo en `storage/app/private`, chmod 600).

---

## 14. Stack tecnológico (decidido)

| Pieza | Tecnología |
|---|---|
| API | Laravel 13, PHP 8.5, MariaDB 11.4 (InnoDB), Sanctum |
| Colas / tareas | Laravel Queue (driver `database` hoy) procesada por cron |
| PC y Panel | React + TypeScript + Vite, Tailwind CSS, TanStack Query, React Router (SPA compilada a estático) |
| App padres | Flutter (Android + iOS), Riverpod, Dio, firebase_messaging, flutter_local_notifications |
| Push | Firebase Cloud Messaging HTTP v1 |
| Pruebas | Pest (API), Vitest (web), Playwright (flujo PC) en GitHub Actions antes de cada deploy |
| Página pública | HTML estático (`web/`) |

Motivo: el hosting compartido solo ejecuta PHP (sin Node persistente ni WebSockets). Capacidad estimada: ~1,000 usuarios activos sin problema; sin partido en tiempo real la carga es baja; se vigila en cPanel > Resource Usage.

---

## 15. Lista para migrar a VPS (regla de diseño desde el día 1)

Objetivo: mover la API a un VPS en horas, sin tocar PC ni App (solo apuntan a `api.ppdguate.com`).

**En el código**
- Toda configuración por `.env` (12-factor). Nada de rutas `/home/ppdgmmle/...` ni nombres del servidor dentro del código.
- Drivers intercambiables por `.env`, nunca llamados directo:
  - `QUEUE_CONNECTION=database` → `redis` en VPS.
  - `CACHE_STORE=database` (o `file`) → `redis`.
  - `FILESYSTEM_DISK=local` → `s3` compatible (DigitalOcean Spaces, Cloudflare R2, etc.). Todos los archivos pasan por `Storage::disk(...)`; las URLs se generan con el disco, nunca armadas a mano.
  - `MAIL_MAILER` SMTP de cPanel → proveedor transaccional (SES, Postmark, etc.).
  - `BROADCAST_CONNECTION=null` hoy → `reverb` (WebSockets) en VPS.
- No hay tiempo real. Si algún día se quisiera, en VPS se agregaría WebSockets (Laravel Reverb) sin romper lo existente.
- Tareas programadas solo en `routes/console.php` (scheduler de Laravel). En cPanel el cron llama a `schedule:run` y `queue:work --stop-when-empty`; en VPS se reemplaza por Supervisor + un solo cron, sin cambiar código.
- Sin funciones exclusivas de cPanel dentro de la app (nada de llamar `uapi` desde PHP).
- Sesiones/autenticación sin estado en el servidor (tokens Sanctum en BD) → se puede tener más de un servidor de API.
- Base de datos estándar MariaDB/MySQL 8 compatible; sin SQL propio de una versión.

**En la operación**
- Deploy por GitHub Actions + SSH + rsync + `php artisan` (sirve igual para cualquier servidor con SSH; solo cambian los secrets `SSH_*`).
- Respaldo diario portátil: `mysqldump` + `storage/` en un `.tar.gz` cifrado; procedimiento de restauración documentado y probado.
- DNS de `api` con TTL bajo (300 s) para cambiar de servidor rápido.
- Variables del `.env` documentadas en `api/.env.example` (sin valores secretos).
- Opcional en VPS: `docker-compose` (php-fpm, nginx, mariadb, redis) que se agregará cuando se decida migrar.

**Señales para migrar**
- Avisos de límite en cPanel > Resource Usage (procesos simultáneos, CPU, memoria).
- Respuestas lentas en horas pico.
- Necesidad de WebSockets reales o de enviar emergencias con intervalos menores a 1 minuto.

---

## 16. Tareas en segundo plano y cron (decisión v1.3)

- **No se usa cola.** Push y correos que dispara una acción del usuario (resultado, convocatoria, cambios, invitaciones) se envían en el mismo proceso **después de responder** (`app()->terminating`): el usuario no espera y no hace falta cron.
- **Cron: solo 2 ejecuciones al día** (hora de Guatemala con `CRON_TZ`):
  - `02:00` `~/ppd-api/ops/backup.sh` → BD + `storage/app` + `.env` en `~/ppdback/daily/ppd-AAAAMMDD-HHMM.tar.gz` (600, carpeta 700, fuera del document root), rotación de 7.
  - `03:10` `php artisan ppd:maintenance` → borra claves de idempotencia, tokens, invitaciones y registros vencidos.
- **Emergencias (futuro)**: única tarea frecuente (repetir aviso cada 1–2 min mientras haya una emergencia abierta). Se agregará cuando se construya el módulo.

---

## 17. Estado del backend (2026-11-22)

Hecho y con pruebas (78, en SQLite y MariaDB 11.4): login y sesiones, TOTP del super admin, organizaciones con marca blanca, miembros e invitaciones, deportes/temporadas/equipos/plantillas/jugadores, calendario, convocatorias, asistencia, ficha del partido con aviso a padres, notificaciones (bandeja + push), planes Gratis/Pro/Premium con cupos, API de la App, Panel de super admin, auditoría, respaldo y mantenimiento diario.
Referencia de endpoints para los agentes: **`docs/API.md`**.

Pendiente (no bloquea a la PC ni al Panel):
- Credenciales de Firebase (`PPD_PUSH_DRIVER=fcm` + llave en `storage/app/private`) — hoy el push se registra en el log.
- Correo saliente real (`MAIL_MAILER=smtp` con noreply@ppdguate.com) — hoy el correo va al log; las invitaciones devuelven `invite_url` para compartir.
- Login con Google y Apple para padres (cuando exista la App).
- Módulo de emergencias.
- Límites exactos del plan Gratis (`config/plans.php`).
