# ProPlayer Data — App de padres (Flutter)

App para que padres y encargados sigan los partidos, entrenos, estadísticas y reportes de sus hijos.
Android primero; iOS después. Identificador `com.ppdguate.app`, nombre visible **ProPlayer Data**.
La App **no usa marca blanca**: siempre se ve con la línea gráfica de ProPlayer Data.

Guía del agente: [`docs/agentes/APP.md`](../docs/agentes/APP.md) · API: [`docs/API.md`](../docs/API.md).

## Correr

```bash
flutter pub get
dart run build_runner build --delete-conflicting-outputs   # modelos freezed/json
flutter run                                                 # usa https://api.ppdguate.com/api
flutter run --dart-define=API_URL=https://otra.api/api      # otra API
flutter run --dart-define=GOOGLE_SERVER_CLIENT_ID=<web client ID>   # muestra «Continuar con Google»
```

«Continuar con Google» solo aparece si se pasa `GOOGLE_SERVER_CLIENT_ID` (el *web client ID* del proyecto;
no es secreto). En Google Cloud debe existir además un cliente OAuth **Android** con el paquete
`com.ppdguate.app` y el SHA-1 de cada firma (la de depuración de cada PC y la de publicación).

## Revisar antes del PR (lo mismo que el CI "App (Flutter)")

```bash
dart format --output=none --set-exit-if-changed lib test
flutter analyze
flutter test
```

## Estructura

```
lib/
  core/       config, cliente HTTP (errores, idempotencia, 401), sesión segura, tema, fechas, widgets
  features/   auth (login, crear cuenta, verificar correo, Google, contraseña olvidada y cambio), home…
  router.dart rutas y redirecciones según la sesión
```

El código generado (`*.g.dart`, `*.freezed.dart`) no se sube; el CI lo genera.
