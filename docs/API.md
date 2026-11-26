# ppd — API (referencia para los agentes de la PC, el Panel y la App)

Base: `https://api.ppdguate.com/api` · Versión del documento: 1.9 (2026-11-27)
Fuente de verdad del diseño: `docs/ARQUITECTURA.md`. Este archivo describe **cómo llamar** a la API.

---

## 1. Reglas comunes

| Tema | Regla |
|---|---|
| Formato | Siempre JSON. Respuestas exitosas: `{ "data": ..., "meta": ... }` |
| Errores | `{ "error": { "code": "codigo_estable", "message": "Texto en español (usted)", ...extra } }`. El cliente decide por `code`; `message` se puede mostrar tal cual. Validación: `code = validation_failed` y `error.fields = { campo: [mensajes] }`; los mensajes vienen en español (`api/lang/es/validation.php`), p. ej. "El equipo es obligatorio." |
| Autenticación | `Authorization: Bearer <token>` (token de `/auth/login`) |
| Plataforma | `X-App-Platform: web \| android \| ios` **obligatorio en el login**. Una sesión por plataforma: iniciar sesión otra vez en la misma plataforma cierra la anterior |
| Idempotencia | En las rutas marcadas ♻️ enviar `Idempotency-Key: <uuid>` (8–128 caracteres `A-Z a-z 0-9 _ -`). Reintentar con la **misma** clave y el **mismo** cuerpo devuelve la respuesta original (encabezado `Idempotency-Replayed: true`) sin repetir el efecto. Generar una clave nueva por cada acción del usuario, no por cada reintento |
| Fechas | ISO 8601 con zona de Guatemala (`2026-11-28T09:00:00-06:00`). Para enviar se acepta ISO o `YYYY-MM-DD HH:MM` (hora de Guatemala) |
| Paginación | `?page=N`; `meta = { current_page, last_page, total }` |
| Límites | 429 `too_many_requests` (respetar `Retry-After`). Login: 5/min por correo+IP |
| CORS | Solo `https://ppdguate.com`, `https://pc.ppdguate.com`, `https://admin.ppdguate.com` |
| Textos | Español de Guatemala, trato de **usted** |

Códigos HTTP: 200/201 ok · 304 sin cambios · 401 `unauthenticated` (volver al login) · 403 `forbidden` u otro código específico · 404 `not_found` · 409/410/422 negocio/validación · 423 `account_locked` · 428 `idempotency_key_required` · 500 `server_error`.

---

## 2. Público (sin sesión)

| Método | Ruta | Uso |
|---|---|---|
| GET | `/public/health` | Estado: `{status:"ok"}` |
| GET | `/public/orgs?search={texto}` | **Buscador de instituciones** (pantalla de inicio de la PC). Busca en nombre y slug sin importar mayúsculas ni tildes; mínimo 2 caracteres (menos → 422 `validation_failed`). Solo organizaciones **activas**, máximo **10**, primero las que empiezan con el texto. Responde `{data:[{name, slug, logo_url, crest_url, colors{primary,secondary,on_primary}}]}` (sin resultados: `data:[]`). No expone id, plan, cupos ni contactos. Límite por IP: **30/min y 300/día** → 429 `too_many_requests`. `Cache-Control: no-store` |
| GET | `/public/orgs/{slug}/branding` | **Marca blanca** para la pantalla de login: `name, slug, type, active, logo_url, crest_url, cover_url, colors{primary,secondary,on_primary}, powered_by`. Caché 5 min + `ETag` (enviar `If-None-Match`) |
| GET | `/public/invitations/{token}` | Datos de la invitación: `status (pending\|expired\|accepted), role, role_label, email_masked, user_exists, player_first_name, organization{marca}` |
| POST ♻️ | `/public/invitations/{token}/accept` | Si `user_exists=false`: `{name, password, password_confirmation, relationship?}`. Si `true`: `{password}` (la de su cuenta). Luego el cliente hace login normal. Errores: `invalid_credentials`, `invitation_unusable` (410), `invitation_not_found` |

Enlaces de invitación: staff → `https://pc.ppdguate.com/{slug}/invitacion?token=...`; padres → `https://ppdguate.com/invitacion?token=...` (la App debe abrir este enlace como universal link / app link).

---

## 3. Sesión (`/auth`)

| Método | Ruta | Cuerpo / Notas |
|---|---|---|
| POST | `/auth/login` | `{email, password}` + `X-App-Platform`. Respuesta: `token, token_type, expires_at, user{id,name,email,must_change_password,is_super_admin}, memberships[{organization_id, role, role_label, branding_editable, permissions, organization{marca}}], is_guardian, admin_totp (null\|setup\|verify)`. `branding_editable` es `true` solo para `org_admin` cuando el super admin permitió que la organización edite su marca. Errores: `invalid_credentials` (mismo mensaje exista o no el correo), `account_locked` (423, `retry_after_minutes`), `no_active_organization` (403), `platform_invalid` |
| GET | `/auth/me` | Igual que el login sin token |
| POST | `/auth/logout` | Cierra la sesión actual |
| POST ♻️ | `/auth/password` | `{current_password, password, password_confirmation}` (mín. 10, letras y números). Cierra las demás sesiones |
| POST | `/auth/password/forgot` | `{email, slug?}` Siempre responde 200 con el mismo mensaje (no revela si el correo existe). Envía un enlace por correo que vence en 60 min: staff → `https://pc.ppdguate.com/{slug}/restablecer?token=`, padres → `https://ppdguate.com/restablecer?token=` |
| GET | `/auth/password/reset/{token}` | `{email_masked}` o 410 `reset_invalid` |
| POST ♻️ | `/auth/password/reset` | `{token, password, password_confirmation}` Cierra todas las sesiones y desbloquea la cuenta. 410 `reset_invalid` |
| POST | `/auth/totp/setup` | Solo super admin sin TOTP: `{secret, otpauth_uri}` (mostrar como QR **una vez**) |
| POST | `/auth/totp/confirm` | `{code}` activa el TOTP |
| POST | `/auth/totp/verify` | `{code}` habilita el Panel en esta sesión (30 min sin uso) |

**Contraseña temporal**: si `must_change_password=true`, la API solo permite `/auth/me`, `/auth/logout` y `/auth/password`; todo lo demás responde 403 `password_change_required`. El cliente debe llevar al usuario a cambiarla.

Ruteo sugerido tras el login: `memberships` no vacío → PC (si hay varias organizaciones, que el usuario elija) · `is_guardian` → App · `is_super_admin` → Panel (pedir TOTP según `admin_totp`).

---

## 4. Común a usuarios con sesión

| Método | Ruta | Notas |
|---|---|---|
| GET | `/catalog/sports` | Catálogo general (todos los deportes que ofrece ppd). Para la PC use `GET /pc/orgs/{slug}/sports` (solo los activados por la organización). Deportes activos con `positions[{id,code,name}]` y `stat_types[{id,code,name,scores}]`. **La PC y la App no tienen lógica fija por deporte**: todo sale de aquí |
| POST | `/me/devices` | `{token, platform}` token FCM (llamar al iniciar sesión y cuando cambie) |
| DELETE | `/me/devices` | `{token}` (al cerrar sesión) |
| GET | `/me/notifications` | Bandeja: `data[{id,kind,title,body,data,organization_id,player_id,read,created_at}]`, `meta.unread` |
| POST | `/me/notifications/read` | `{ids?: [..]}` sin ids = todas |

Tipos de aviso (`kind`): `callup`, `match_result`, `event_changed`, `event_cancelled`. El push trae en `data`: `kind`, `event_id`, `player_id`, `team_id` (todo texto). Canal Android: `general`.

---

## 5. PC — Plataforma Coach: `/pc/orgs/{slug}/...`

Requiere membresía activa en la organización (`org_admin`, `director` o `coach`). Si no es miembro: 404. Organización suspendida: 403 `organization_suspended`.
Permisos (v1.4, ver `docs/ARQUITECTURA.md` §2): **admin** todo · **director técnico** solo su alcance (deportes y/o equipos asignados por el admin) · **coach** solo sus equipos asignados. Lo que no puede hacer → 403 `forbidden`.

**Permisos para la interfaz** (`memberships[].permissions` en el login, o `GET access`):
```json
{
  "invite_roles": ["coach","guardian"],          // roles que puede invitar
  "manage_members": true,                        // ver/administrar miembros (director: solo sus coaches)
  "manage_directors": false,                     // solo admin: alcance de directores
  "manage_seasons": false, "manage_plans": false, "manage_branding": false,
  "manage_sports": false,                        // solo admin: activar/desactivar deportes de la organización
  "manage_positions": [1],                       // ids de deportes donde puede editar posiciones (admin: activados; director: su alcance; coach: deportes de sus equipos)
  "create_teams": [1, 5],                        // "all" (admin: todos los ACTIVADOS) | ids de deportes donde puede crear equipos | []
  "delete_players": false,
  "create_players_without_team": false,           // solo admin: registrar jugador sin equipo
  "director_scope": {"sport_ids": [1, 5], "team_ids": [12]}   // null si no es director
}
```
| Método | Ruta | Notas |
|---|---|---|
| GET | `access` | `{roles, permissions, team_ids}` del usuario en esta organización |

### Deportes de la organización
El catálogo (deportes, posiciones, estadísticas) es del super admin. El admin del colegio solo **activa** los que usa.
**Posiciones por organización:** al activar un deporte, la organización recibe una copia de las posiciones del catálogo y desde ahí las edita (todos sus coaches de ese deporte comparten la lista). `positions` en `GET sports`, `GET teams/{id}` y `GET events/{id}` son las de la organización (`{id, code, name, sort}`). Plantilla y ficha solo aceptan posiciones de la organización y del deporte del equipo.
Códigos y nombres de deporte en inglés (`soccer`/Soccer, `futsal`/Futsal, `basketball`/Basketball, `volleyball`/Volleyball, `american_football`/American Football, `baseball`/Baseball); posiciones y estadísticas en español.

| Método | Ruta | Quién | Notas |
|---|---|---|---|
| GET | `sports` | todos | Deportes activados que el miembro ve, con `positions` y `stat_types`: admin todos; director los de su alcance (sus deportes y los de sus equipos sueltos); coach los de sus equipos |
| PUT | `sports` | admin (`manage_sports`) | `{sport_ids:[...]}` reemplaza la lista (repetirlo no cambia nada). Desactivar un deporte con equipos → 422 `sport_in_use` con `error.sport_ids`. Al desactivar se quita ese deporte del alcance de los directores. Al activar se copian las posiciones del catálogo (solo la primera vez; reactivar conserva la lista editada). Responde la lista nueva |
| POST ♻️ | `sports/{sportId}/positions` | `manage_positions` | `{name, code?, sort?}`. Sin `code` se genera (p. ej. "LIB", "LIB2"). Nombre repetido o código tomado → 422 |
| PATCH | `positions/{id}` | `manage_positions` | `{name?, sort?}` |
| DELETE | `positions/{id}` | `manage_positions` | 422 `position_in_use` (con `error.players`) si algún jugador la tiene en una plantilla activa. Las fichas pasadas no bloquean y conservan el nombre (`lineup[].position_name`) |

### Temporadas y equipos
| Método | Ruta | Quién | Cuerpo |
|---|---|---|---|
| GET | `seasons` | todos | |
| POST ♻️ | `seasons` | admin | `{name, starts_on?, ends_on?, is_current?}` |
| PATCH | `seasons/{id}` | admin | |
| GET | `teams?sport_id=` | todos (según alcance) | cada equipo trae `can_manage` |
| POST ♻️ | `teams` | admin; director solo en deportes de `create_teams` | `{name, sport_id, season_id?, category?, gender?(male\|female\|mixed), color?}`. Deporte no activado → 422 `sport_not_enabled` |
| GET | `teams/{id}` | quien lo ve | incluye `sport` completo, `staff` (el coach solo se ve a sí mismo) y `can_manage` |
| PATCH / DELETE | `teams/{id}` | admin; director con el equipo en su alcance | No se cambia el deporte si ya hay jugadores (`sport_locked`); el deporte nuevo debe estar activado (`sport_not_enabled`) |
| POST | `teams/{id}/staff` | admin (cualquier miembro); director (solo coaches que él administra) | `{user_id, role?(head_coach\|assistant)}` |
| DELETE | `teams/{id}/staff/{userId}` | admin; director de ese equipo | |
| GET | `teams/{id}/roster` | quien lo ve | jugadores con `jersey_number, position, active` |
| POST | `teams/{id}/roster` | quien trabaja el equipo | `{player_id, jersey_number?, sport_position_id?}` |
| PATCH / DELETE | `teams/{id}/roster/{playerId}` | quien trabaja el equipo | `{jersey_number?, sport_position_id?, active?}` |

### Jugadores (menores: datos mínimos)
| Método | Ruta | Quién | Notas |
|---|---|---|---|
| GET | `players?team_id=&search=` | todos (coach: de sus equipos) | paginado 50 |
| POST ♻️ | `players` | admin; coach/director con `team_id` de su equipo | `{first_name, last_name, birthdate?, gender?, document_number?, notes?, team_id?, jersey_number?, sport_position_id?}` |
| GET | `players/{id}` | quien lo ve | incluye `teams`, `guardians` (correo solo para admin), `document_number`, `notes` |
| PATCH | `players/{id}` | quien lo ve | |
| DELETE | `players/{id}` | admin | |
| POST | `players/{id}/photo` | quien lo ve | multipart `photo` (jpg/png/webp, máx. 3 MB) |

`photo_url` es una URL **firmada que vence en 15 minutos**: no guardarla; pedirla de nuevo con el jugador.

### Calendario, convocatorias, asistencia y ficha
Cada evento trae `is_draft`, `published_at`, `time_pending` y `series_id` (borrador = `published_at: null`). `display_title` de partidos: "{equipo} vs {rival}" (sin rival: "{equipo} · Partido"); si el evento tiene `title`, se usa ese. Mientras es borrador, cambiar fecha/lugar, convocar o cancelar no avisa a nadie.

| Método | Ruta | Cuerpo / Notas |
|---|---|---|
| GET | `events?undated_drafts=1&team_id=&type=&sport_id=` | Borradores **sin fecha** que el miembro ve (más recientes primero, máx. 200). Ignora `from/to` |
| GET | `events?from=&to=&team_id=&type=&sport_id=` | Hasta 120 días entre `from` y `to` (ambos incluidos; p. ej. 2026-01-01 a 2026-05-01). Más → 422 `range_too_large`. Sin rango: el mes actual + 6 semanas |
| GET | `events?pending_sheet=1` | Partidos ya jugados (últimos 120 días), publicados (no borradores), no cancelados y **sin resultado publicado** (ignora `from/to`) |
| POST ♻️ | `events` | `{team_id, type(match\|training\|other), starts_at, ends_at?, title?, location?, opponent_name?, home_away?(home\|away\|neutral), notes?, publish?(default true), callups?:[{player_id, status?}]}`. `publish:false` = **borrador**: no aparece en la App ni en `pending_sheet` y no avisa a nadie. `callups` crea y convoca en una sola llamada (jugadores activos del equipo; si no, 422 y no se crea nada); si se publica, avisa a los padres de los convocados. `starts_at` puede ser `null` solo en borradores; `time_pending:true` = borrador con fecha (`starts_at:"YYYY-MM-DD"`) y hora por definir (al poner la hora envíe `time_pending:false`). **Para publicar** (aquí con `publish:true` o en `publish`): fecha y hora siempre (sin `time_pending`); en partidos además rival → si falta, 422 `publish_incomplete` con `error.fields.starts_at`/`opponent_name`; en **partidos y entrenos** al menos un convocado → 422 `callups_required`. `notify:true` en un **entreno** publicado: un aviso por padre de los convocados, sin nombres («Se programó un entreno de {equipo}: {fecha}, {hora}») en lugar del aviso de convocatoria. Los borradores se guardan sin fecha, rival ni convocados. **Envíe siempre `publish`**: si se omite se publica exigiendo solo la fecha (compatibilidad). |
| POST ♻️ | `events/series` | **Entrenos recurrentes** (se publican): `{team_id, type:"training", from:"YYYY-MM-DD"(hoy o después), until:"YYYY-MM-DD"(máx. 1 año), weekdays:[1..7 ISO, 1=lunes], time:"HH:mm", title?, location?, notes?, callups:[{player_id, status?}](al menos 1), notify?}`. Crea todos en una transacción con un `series_id` común (solo fechas futuras). Máx. 200 → 422 `series_too_large`; ninguno → 422 `series_empty`. Con `notify:true`, **un aviso por padre** de los convocados para toda la serie, sin nombres: «Se programaron N entrenos de {equipo}: {días}, {hora}, del {inicio} al {fin}.». Responde `{series_id, count, notified}` |
| POST ♻️ | `events/{id}/publish` | Publica un borrador: aparece en la App, avisa a los padres de los convocados y, si ya había asistencia guardada (partidos), la avisa también. Mismos requisitos: `publish_incomplete` (fecha y hora; en partidos también rival) y `callups_required` (partidos y entrenos). Si ya estaba publicado responde igual sin volver a avisar. Cancelado → 422 `event_closed` |
| GET | `events/{id}` | Detalle con `sport{positions, stat_types}` del equipo, `callups`, `attendance`, `lineup`, `actions`, `player_stats` |
| PATCH | `events/{id}` | Mismos campos + `status: scheduled\|cancelled`. Cambiar fecha/lugar o cancelar **avisa a los padres** (en borrador no). En borrador `starts_at:null` vale; publicado no se quita la fecha, la hora (`time_pending:true`) ni el rival (422 `validation_failed`) |
| DELETE | `events/{id}` | Borradores y cancelados sin resultado. Publicado y programado → 422 `event_must_cancel` (primero cancelar, que avisa). Con resultado publicado → 422 `event_has_result` |
| PUT ♻️ | `events/{id}/callups` | `{players:[{player_id, status?(called\|reserve)}], notify?}` Reemplaza la lista. Avisa a los padres de los **nuevos** convocados (una sola vez); en borrador guarda **sin avisar** (el aviso sale al publicar). Se ve la respuesta del padre en `guardian_response` |
| PUT ♻️ | `events/{id}/attendance` | `{records:[{player_id, status(present\|excused\|injured\|absent\|null), note?}]}`: Asiste, No asiste con aviso, Lesión, No justificado. `status:null` borra la marca del jugador. Solo cambia los jugadores enviados. En un **partido publicado** avisa a los padres de cada jugador cuyo estado cambió ("Ana: Lesión."); repetir el mismo estado no avisa; en borrador no avisa (se avisa al publicar). Responde `{count, changed, notified}`. `late` ya no existe (se migró a `present`) |
| PUT ♻️ | `events/{id}/match-sheet` | **Ficha del partido al final** (no hay tiempo real). En borrador → 422 `event_draft`. Ver abajo |

Ficha del partido:
```json
{
  "score_us": 2, "score_them": 1, "publish": true,
  "lineup": [ {"player_id": 15, "is_starter": true, "sport_position_id": 3, "jersey_number": 9, "minutes_played": 60} ],
  "actions": [
    {"stat_code": "goal", "player_id": 15, "minute": 10, "period": 1},
    {"stat_code": "yellow_card", "player_id": 18},
    {"type": "sub_in", "player_id": 18, "related_player_id": 15, "minute": 40}
  ]
}
```
- `stat_code` sale de `/catalog/sports` del deporte del equipo; `value` (1–99) para sumar varias de una vez.
- Guardar reemplaza la ficha completa (idempotente). `publish:false` = borrador.
- **Una vez publicado, toda corrección cuenta como publicación** aunque se envíe `publish:false` (no se puede "despublicar").
- `publish:true` marca el partido `finished` y **avisa a los padres** de la plantilla activa (personalizado con lo que hizo su hijo). Corregir sin cambiar el marcador no repite el aviso; si cambia el marcador se envía "Resultado corregido".
- La respuesta trae `warnings` (por ejemplo, si la suma de goles de los jugadores no coincide con `score_us`). No bloquea.

### Invitaciones, miembros, planes y marca
| Método | Ruta | Quién | Notas |
|---|---|---|---|
| GET | `invitations` | admin: todas; otros: las suyas | pendientes |
| POST ♻️ | `invitations` | según `permissions.invite_roles`: admin todos; director `coach\|guardian`; coach `guardian` (de jugadores que ve) | `{email, role, player_id?(obligatorio en guardian), team_ids?, sport_ids?}`. **coach**: `team_ids` = equipos que tendrá (director: solo de su alcance). **director**: `sport_ids` (solo deportes activados) y/o `team_ids` = su alcance (al menos uno). Responde `invite_url` |
| POST ♻️ | `invitations/{id}/resend` | admin o quien la creó | Genera un enlace nuevo (el anterior deja de servir), renueva la vigencia y reenvía el correo. Devuelve `invite_url` |
| DELETE | `invitations/{id}` | admin o quien la creó | anula |
| GET | `members` | admin: todos (con `director_scope{sports,teams}` de cada director); director: solo los coaches que administra | con equipos asignados |
| PATCH | `members/{id}` | admin; director (sus coaches) | `{status: active\|disabled}` (no a sí mismo) |
| PUT | `members/{id}/scopes` | admin | Alcance de un **director técnico**: `{sport_ids:[...], team_ids:[...]}` (reemplaza el anterior; `sport_ids` solo de deportes activados) |
| POST | `members/{id}/reset-password` | admin; director (sus coaches) | Devuelve `reset_url` (vence en 24 h) para compartir por WhatsApp. No a sí mismo |
| DELETE | `members/{id}` | admin; director (sus coaches) | quita el rol (y sus equipos o su alcance) |
| GET | `plans` | admin | planes vigentes + `meta.usage{pro{quota,used},premium{...}}` |
| POST ♻️ | `plans` | admin | `{email, plan(pro\|premium), ends_at?, note?}` el correo debe ser de un padre de la organización. `quota_exceeded` si no hay cupo |
| DELETE | `plans/{id}` | admin | revoca y libera cupo |
| PATCH | `branding` | admin, si `branding_editable_by_org` | `{color_primary?, color_secondary?, color_on_primary?}` (`branding_locked` si no está permitido) |
| POST | `branding/{logo\|crest\|cover}` | igual | multipart `image` png/jpg/webp ≤ 2 MB (sin SVG) |

---

## 6. App de padres: `/app/...`

El padre solo ve **a sus hijos** y **solo los datos de su hijo** (no los de otros jugadores). **Nunca mostrar precios, "comprar", "suscribirse" ni mencionar pagos** (Apple 3.1.3(c)).

| Método | Ruta | Notas |
|---|---|---|
| GET | `children` | `id, first_name, last_name, photo_url, organization{marca}, teams[{id,name,category,sport{code,name},jersey_number}], plan_level` → pintar la App con la marca de la organización del hijo seleccionado |
| GET | `children/{id}/events?from=&to=` | Eventos **publicados** de los equipos del hijo (los borradores no aparecen) con `callup{status,response}`. `meta.history_limited=true` si el plan recortó el pasado. Marcador `null` hasta que se publique |
| GET | `children/{id}/events/{eventId}` | Detalle: `callup`, `attendance{status(present\|excused\|injured\|absent), note}`, `child_played{is_starter,minutes_played}`, `child_stats[{code,name,value}]`. Fuera del límite del plan: 403 `plan_limit` |
| POST ♻️ | `children/{id}/events/{eventId}/callup-response` | `{response: confirmed\|declined}` antes del partido (`not_called`, `event_closed`) |
| GET | `children/{id}/stats?team_id=` | `by_sport[{sport_id, matches, minutes, stats[{code,name,value}]}]`, `attendance{present,excused,injured,absent}` (solo actividades publicadas). `meta.limited` en Gratis |
| GET | `plan` | `level(free\|pro\|premium), label, assigned_by (organización), ends_at, pro_player_id, can_change_pro_child, limits` |
| POST | `plan/pro-child` | `{player_id}` elegir el hijo del plan Pro (cambios cada 30 días: `pro_child_locked`) |
| DELETE | `account` | `{password}` borrar cuenta (obligatorio en tiendas). Admin de organización: 409 `is_org_admin` |

Texto sugerido al topar un límite: *"Esta función tiene un límite en su plan actual. Consulte con su institución."*

---

## 7. Panel de super admin: `/admin/...`

Requiere `is_super_admin` + TOTP verificado en la sesión (`/auth/totp/verify`). Errores: `totp_setup_required`, `totp_required` (403). La verificación vence tras 30 min sin uso.

| Método | Ruta | Notas |
|---|---|---|
| GET | `organizations?search=&status=` | paginado |
| POST ♻️ | `organizations` | `{name, slug, type(school\|team), color_primary?, color_secondary?, color_on_primary?, quota_pro?, quota_premium?, branding_editable_by_org?, contact_email?, contact_phone?, notes?, admin_email?}` → `meta.admin_invite_url` |
| GET / PATCH | `organizations/{id}` | PATCH acepta lo mismo + `status: active\|suspended` |
| POST | `organizations/{id}/branding/{logo\|crest\|cover}` | multipart `image` |
| POST ♻️ | `organizations/{id}/invitations` | `{email, role(org_admin\|director\|coach), sport_ids?, team_ids?}` (director: al menos un deporte o equipo; los `sport_ids` se activan en la organización si no lo estaban) |
| GET | `organizations/{id}/members` | |
| GET / POST | `sports` | POST `{code, name, periods, period_minutes?, max_on_field?, unlimited_substitutions?, sort?}` |
| PATCH | `sports/{id}` | incluye `active:false` para retirar un deporte |
| POST | `sports/{id}/positions` · `sports/{id}/stat-types` | `{code, name, sort?}` · `{code, name, scores?, sort?}` |
| PATCH | `positions/{id}` · `stat-types/{id}` | solo `name`/`sort` |
| GET | `plans?email=&organization_id=` | |
| POST ♻️ | `plans` | `{email, plan, organization_id?(consume cupo), ends_at?, note?}` |
| DELETE | `plans/{id}` | |
| GET | `audit?organization_id=&actor_user_id=&action=&from=&to=` | |

---

## 8. Archivos (todo sale de `https://api.ppdguate.com`)

- Fotos de jugadores: privadas, solo por `photo_url` firmada (15 min): `https://api.ppdguate.com/api/files/players/{id}/photo?...&signature=...`.
- Logos/escudos/portadas de organizaciones: públicos: `https://api.ppdguate.com/storage/orgs/{id}/...`.
- Por eso en la CSP de la PC basta `img-src 'self' https://api.ppdguate.com data:` y `connect-src https://api.ppdguate.com`.

## 9. Páginas públicas en ppdguate.com (mientras no existe la App)

- `https://ppdguate.com/invitacion?token=` — los padres aceptan su invitación (crear cuenta o vincular con su contraseña).
- `https://ppdguate.com/restablecer?token=` — los padres crean una nueva contraseña.
La PC tiene sus propias pantallas `/{slug}/invitacion` y `/{slug}/restablecer` para el staff.
