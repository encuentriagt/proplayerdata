# PARA EL AGENTE DE LA APP (Flutter — App de padres) — NO PEGAR EN LA TERMINAL

Usted construirá la **App de padres y encargados** de **ProPlayer Data** en Flutter, **Android primero** y después iOS. La App es **solo para padres**, siempre con la imagen de **ProPlayer Data** (sin marca blanca), y reúne en **una sola cuenta** a todos los hijos del padre, de todas sus organizaciones y deportes (ver decisiones del dueño en `docs/ARQUITECTURA.md`). El backend ya está en producción y lo dirige el **agente de backend**: cualquier cambio en la API se le pide a él (usted no modifica `api/`).

---

## 1. Lea primero (repositorio `encuentriagt/proplayerdata`)

1. `docs/ARQUITECTURA.md`: qué es ppd, roles, decisiones del dueño para la App, planes, emergencias (§13, futuro).
2. `docs/API.md`: **todos los endpoints**. Para la App: §1 Reglas comunes, §2 Público, §3 Sesión, §4 Común (dispositivos y bandeja de avisos) y **§6 App de padres**.
3. `docs/agentes/PC-WEB.md`: cómo trabaja el agente de la web (mismas reglas de equipo).

Usted trabaja **solo en la carpeta `app/`**. No toque `api/`, `pc/`, `web/`, `docs/` ni `.github/`.

---

## 2. Cómo trabajamos con GitHub

- Repositorio: `https://github.com/encuentriagt/proplayerdata` (monorepo: `api/`, `pc/`, `web/`, `app/`, `docs/`).
- **`main` está protegida**: nadie sube directo. Todo cambio va por **Pull Request**.
- Flujo:
  1. Actualice: `git checkout main && git pull`.
  2. Cree una rama **`app/<tema-corto>`** (ej. `app/login`, `app/calendario`).
  3. Commits pequeños con mensajes en español que digan qué cambió.
  4. `git push -u origin app/<tema>` y abra el **PR hacia `main`** con: qué hace, cómo probarlo, capturas, y una sección **“Pendientes de API”** si necesita algo que no está en `docs/API.md`.
  5. El check **“App (Flutter)”** debe quedar en verde (`flutter analyze` + `flutter test`).
  6. Avise al dueño; el **agente de backend revisa y une** (squash). Usted no une sus propios PR.
- Un PR por tema. Si un PR depende de otro, dígalo en la descripción. Si `main` avanzó y hay conflicto, **rebase** sobre `main` y `git push --force-with-lease` (solo en su rama).
- **No suba nunca**: llaves, keystores (`*.jks`, `*.keystore`), `key.properties`, contraseñas, certificados, `.env`, ni archivos de credenciales de Firebase **de servidor**. Ya están en `.gitignore`; si algo sensible aparece en `git status`, no lo agregue.
- La publicación en Google Play / App Store **no** es automática: se hace al final, con el dueño.

---

## 3. Stack (decidido)

- **Flutter estable** (Dart 3), Android mínimo **API 24**, iOS mínimo **15**.
- Estado: **Riverpod**. Navegación: **go_router**. HTTP: **dio** (con interceptores). Modelos: `freezed` + `json_serializable`.
- Sesión: **flutter_secure_storage** (Keychain / Keystore). Nunca `SharedPreferences` para el token.
- Google y Apple: **google_sign_in** (con `serverClientId` = el *web client ID* del proyecto) y **sign_in_with_apple** (con `nonce`; envíe el nombre la primera vez). La App manda el `id_token` a `POST /app/auth/social`; nunca guarda llaves.
- Push: **firebase_messaging** + **flutter_local_notifications** (canal Android `general`; más adelante `emergencias`).
- Fechas: `intl` con locale **`es`** y zona **America/Guatemala** (la API manda ISO 8601 con zona).
- Imágenes: `cached_network_image` **solo para logos y escudos** (públicos). Las fotos de jugadores **no se cachean en disco** (URL firmada de 15 min).
- Pruebas: `flutter_test` (unidades y widgets) y al menos una prueba del flujo principal con la API simulada.
- Sin analíticas ni rastreadores de terceros (la App muestra datos de **menores**). Si más adelante se necesita, Crashlytics sin datos personales, previa aprobación.
- Identificador: **`com.ppdguate.app`**, nombre visible **“ProPlayer Data”** (confirmado por el dueño).
- Base de la API: `https://api.ppdguate.com/api` (por `--dart-define=API_URL=...`; no hay CORS en móviles, se usa producción con la cuenta demo).

---

## 4. Reglas que no se rompen

- **Textos en español de Guatemala, trato de usted** (“Ingrese su correo”, “Confirme la asistencia”). Única excepción: los **nombres de deportes** vienen en inglés desde la API (Soccer, Basketball…); se muestran tal cual.
- **Nada de pagos**: nunca mostrar precios, “comprar”, “suscribirse”, “mejorar plan” ni mencionar cobros (regla de Apple 3.1.3). Los planes los asigna la institución. Al topar un límite: *“Esta función tiene un límite en su plan actual. Consulte con su institución.”*
- **Imagen única**: la App siempre se ve como **ProPlayer Data**. El nombre y el escudo del colegio solo aparecen como dato de cada hijo, evento o aviso (p. ej. «Colegio A · Ana · Soccer»).
- **Seguridad**:
  - Login con `X-App-Platform: android` o `ios`. Token en almacenamiento seguro; se envía como `Authorization: Bearer <token>` y siempre `Accept: application/json`.
  - **401** → borrar token y volver al login. **403** → mostrar `error.message`. `password_change_required` → pantalla obligatoria de cambio de contraseña.
  - El token vence a los 30 días: al vencer, login de nuevo (no hay refresh).
  - Nunca registrar (log) tokens, contraseñas ni datos de jugadores. Nada de secretos en el código.
  - Solo HTTPS. Sin `WebView` para mostrar datos de la API.
- **Idempotencia**: en las rutas ♻️ de `docs/API.md` envíe `Idempotency-Key` con un UUID **por acción del usuario**; si se reintenta por falla de red, **la misma** clave. Deshabilite el botón mientras envía.
- **Errores**: decida por `error.code` y muestre `error.message`. `validation_failed` → `error.fields` debajo de cada campo (ya vienen en español).
- **Privacidad**: el padre ve **solo a sus hijos** y **solo los datos de su hijo**. La App nunca pide ni muestra datos de otros jugadores.
- **Borrar cuenta** dentro de la App (Ajustes → “Eliminar mi cuenta”, `DELETE /app/account` con contraseña). Es obligatorio para las tiendas.
- **No hay partido en tiempo real**: el resultado llega cuando el coach publica la ficha.

---

## 5. Pantallas (primera versión)

| Pantalla | API |
|---|---|
| Inicio de sesión (correo y contraseña) y botones **«Continuar con Google»** y **«Continuar con Apple»** (en iOS, Apple es obligatorio si hay Google). Una cuenta de staff recibe `invalid_credentials` | `POST /auth/login`, `POST /app/auth/social` |
| Cambiar contraseña (obligatoria si `must_change_password`) | `POST /auth/password` |
| **Registro** del padre y **verificación del correo** con código (pantalla obligatoria si `must_verify_email`). Contraseña olvidada con código | `POST /app/auth/register`, `/app/auth/verify-email`, `/app/auth/verify-email/resend`, `/app/auth/password/forgot` y `/reset` |
| **Mis hijos** (selector arriba si hay más de uno; cambia la marca) | `GET /app/children` |
| **Calendario** del hijo: próximos y pasados, partidos/entrenos/otros, marcador cuando exista, cancelados tachados | `GET /app/children/{id}/events?from=&to=` |
| **Detalle del evento**: convocatoria y botones **Confirmar / No puede asistir**, asistencia (Asiste, No asiste con aviso, Lesión, No justificado), minutos, titular y estadísticas del hijo | `GET …/events/{eventId}`, `POST …/callup-response` ♻️ |
| **Estadísticas** del hijo por deporte y asistencia | `GET /app/children/{id}/stats?team_id=` |
| **Avisos** (bandeja) con no leídos | `GET /me/notifications`, `POST /me/notifications/read` |
| **Ajustes**: datos de la cuenta, plan actual (solo informativo), hijo del plan Pro, cerrar sesión, eliminar cuenta | `GET /app/plan`, `POST /app/plan/pro-child`, `POST /auth/logout`, `DELETE /app/account` |

Al cambiar de hijo o volver a la App, refresque. Sin conexión: muestre lo último cargado con un aviso “Sin conexión”.

---

## 6. Avisos push

- Tras el login y cada vez que FCM renueve el token: `POST /me/devices {token, platform}`. Al cerrar sesión: `DELETE /me/devices {token}`.
- Pida el permiso de notificaciones **después** del login, con una pantalla previa que explique para qué.
- `data` del push (todo texto): `kind`, y según el caso `event_id`, `player_id`, `team_id`, `status`, `series_id`, `count`.
- Tipos (`kind`) y a dónde lleva al tocarlo:

| kind | Cuándo | Abrir |
|---|---|---|
| `callup` | Convocaron al hijo | Detalle del evento |
| `trainings` | Se programaron uno o varios entrenos (un solo aviso, sin nombres) | Calendario del equipo |
| `event_changed` / `event_cancelled` | Cambió fecha/lugar o se canceló | Detalle del evento |
| `attendance` | El coach registró o corrigió la asistencia de un partido | Detalle del evento |
| `match_result` | Se publicó el resultado | Detalle del evento |

- Con la App abierta, muestre el aviso dentro de la App y actualice la bandeja.
- **Emergencias (después)**: tendrá canal propio con sonido insistente y pantalla completa. Deje la estructura preparada (canal y manejo de `kind`), sin implementarla todavía.

---

## 7. Enlace de vinculación (sin contraseña)

Decisión del dueño: el enlace del correo **abre la App y vincula solo**, sin pedir contraseña (el padre pudo crear su cuenta con Google).
- Registre en Android el esquema **`ppdguate://invitacion?token=…`** (intent-filter con `scheme="ppdguate" host="invitacion"`) y, cuando exista la firma, el App Link verificado **`https://ppdguate.com/invitacion?token=…`** (`autoVerify`). Pase en su PR el **SHA-256** del certificado de firma para publicar `assetlinks.json`.
- La página `https://ppdguate.com/invitacion` ya no pide contraseña: abre la App con `intent://invitacion?token=…#Intent;scheme=ppdguate;package=com.ppdguate.app;…` y, si no está instalada, lleva a Google Play; también muestra el código corto.
- Al recibir el enlace: si hay sesión verificada → `POST /app/invitations/accept-token {token}` y muestre «Ana quedó vinculada a su cuenta». Si no hay sesión → guarde el token (memoria segura), pida entrar o registrarse y verificar el correo, y al terminar llame a `accept-token`. Errores: 404, 409 `invitation_used`, 410 `invitation_closed` (muestre `error.message`).
- Restablecer contraseña: se hace dentro de la App con código (`/app/auth/password/forgot` y `/reset`).

## 8. Cuenta para probar

Organización de demostración **`colegio-demo`**. El dueño le dará el correo de una cuenta de **padre demo** y su contraseña **fuera del chat público y fuera de GitHub** (nunca en el código, issues ni PR).

---

## 9. Orden sugerido de PR

1. `app/base`: proyecto, estructura, tema ProPlayer Data, cliente HTTP (errores, idempotencia, 401), login, cambio de contraseña, prueba del flujo.
2. `app/hijos-calendario`: Mis hijos, calendario, detalle y respuesta a la convocatoria.
3. `app/estadisticas-avisos`: estadísticas, bandeja, push (Firebase).
4. `app/ajustes`: plan informativo, hijo Pro, cerrar sesión, eliminar cuenta.
5. `app/tiendas`: íconos, pantalla de inicio, textos legales, preparación para Google Play y App Store (con el dueño).
