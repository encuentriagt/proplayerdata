# ppd — API (referencia para los agentes de la PC, el Panel y la App)

Base: `https://api.ppdguate.com/api` · Versión del documento: 1.2 (2026-11-23)
Fuente de verdad del diseño: `docs/ARQUITECTURA.md`. Este archivo describe **cómo llamar** a la API.

---

## 1. Reglas comunes

| Tema | Regla |
|---|---|
| Formato | Siempre JSON. Respuestas exitosas: `{ "data": ..., "meta": ... }` |
| Errores | `{ "error": { "code": "codigo_estable", "message": "Texto en español (usted)", ...extra } }`. El cliente decide por `code`; `message` se puede mostrar tal cual. Validación: `code = validation_failed` y `error.fields = { campo: [mensajes] }` |
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
| GET | `/catalog/sports` | Deportes activos con `positions[{id,code,name}]` y `stat_types[{id,code,name,scores}]`. **La PC y la App no tienen lógica fija por deporte**: todo sale de aquí |
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
  "create_teams": [1, 5],                        // "all" (admin) | ids de deportes donde puede crear equipos | []
  "delete_players": false,
  "create_players_without_team": false,           // solo admin: registrar jugador sin equipo
  "director_scope": {"sport_ids": [1, 5], "team_ids": [12]}   // null si no es director
}
```
| Método | Ruta | Notas |
|---|---|---|
| GET | `access` | `{roles, permissions, team_ids}` del usuario en esta organización |

### Temporadas y equipos
| Método | Ruta | Quién | Cuerpo |
|---|---|---|---|
| GET | `seasons` | todos | |
| POST ♻️ | `seasons` | admin | `{name, starts_on?, ends_on?, is_current?}` |
| PATCH | `seasons/{id}` | admin | |
| GET | `teams?sport_id=` | todos (según alcance) | cada equipo trae `can_manage` |
| POST ♻️ | `teams` | admin; director solo en deportes de `create_teams` | `{name, sport_id, season_id?, category?, gender?(male\|female\|mixed), color?}` |
| GET | `teams/{id}` | quien lo ve | incluye `sport` completo, `staff` (el coach solo se ve a sí mismo) y `can_manage` |
| PATCH / DELETE | `teams/{id}` | admin; director con el equipo en su alcance | No se cambia el deporte si ya hay jugadores (`sport_locked`) |
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
| Método | Ruta | Cuerpo / Notas |
|---|---|---|
| GET | `events?from=&to=&team_id=&type=` | Máx. 120 días. Sin rango: el mes actual + 6 semanas |
| GET | `events?pending_sheet=1` | Partidos ya jugados (últimos 120 días), no cancelados y **sin resultado publicado** (ignora `from/to`) |
| POST ♻️ | `events` | `{team_id, type(match\|training\|other), starts_at, ends_at?, title?, location?, opponent_name?, home_away?(home\|away\|neutral), notes?}` |
| GET | `events/{id}` | Detalle con `sport{positions, stat_types}` del equipo, `callups`, `attendance`, `lineup`, `actions`, `player_stats` |
| PATCH | `events/{id}` | Mismos campos + `status: scheduled\|cancelled`. Cambiar fecha/lugar o cancelar **avisa a los padres** |
| DELETE | `events/{id}` | No si tiene resultado publicado (`event_has_result`) |
| PUT ♻️ | `events/{id}/callups` | `{players:[{player_id, status?(called\|reserve)}], notify?}` Reemplaza la lista. Avisa a los padres de los **nuevos** convocados (una sola vez). Se ve la respuesta del padre en `guardian_response` |
| PUT ♻️ | `events/{id}/attendance` | `{records:[{player_id, status(present\|absent\|late\|excused), note?}]}` |
| PUT ♻️ | `events/{id}/match-sheet` | **Ficha del partido al final** (no hay tiempo real). Ver abajo |

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
| POST ♻️ | `invitations` | según `permissions.invite_roles`: admin todos; director `coach\|guardian`; coach `guardian` (de jugadores que ve) | `{email, role, player_id?(obligatorio en guardian), team_ids?, sport_ids?}`. **coach**: `team_ids` = equipos que tendrá (director: solo de su alcance). **director**: `sport_ids` y/o `team_ids` = su alcance (al menos uno). Responde `invite_url` |
| POST ♻️ | `invitations/{id}/resend` | admin o quien la creó | Genera un enlace nuevo (el anterior deja de servir), renueva la vigencia y reenvía el correo. Devuelve `invite_url` |
| DELETE | `invitations/{id}` | admin o quien la creó | anula |
| GET | `members` | admin: todos (con `director_scope{sports,teams}` de cada director); director: solo los coaches que administra | con equipos asignados |
| PATCH | `members/{id}` | admin; director (sus coaches) | `{status: active\|disabled}` (no a sí mismo) |
| PUT | `members/{id}/scopes` | admin | Alcance de un **director técnico**: `{sport_ids:[...], team_ids:[...]}` (reemplaza el anterior) |
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
| GET | `children/{id}/events?from=&to=` | Eventos de los equipos del hijo con `callup{status,response}`. `meta.history_limited=true` si el plan recortó el pasado. Marcador `null` hasta que se publique |
| GET | `children/{id}/events/{eventId}` | Detalle: `callup`, `attendance`, `child_played{is_starter,minutes_played}`, `child_stats[{code,name,value}]`. Fuera del límite del plan: 403 `plan_limit` |
| POST ♻️ | `children/{id}/events/{eventId}/callup-response` | `{response: confirmed\|declined}` antes del partido (`not_called`, `event_closed`) |
| GET | `children/{id}/stats?team_id=` | `by_sport[{sport_id, matches, minutes, stats[{code,name,value}]}]`, `attendance{present,late,absent,excused}`. `meta.limited` en Gratis |
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
| POST ♻️ | `organizations/{id}/invitations` | `{email, role(org_admin\|director\|coach), sport_ids?, team_ids?}` (director: al menos un deporte o equipo) |
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
