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
```

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
  features/   auth (login, recuperar y cambiar contraseña), home…
  router.dart rutas y redirecciones según la sesión
```

El código generado (`*.g.dart`, `*.freezed.dart`) no se sube; el CI lo genera.
