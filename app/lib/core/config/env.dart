import 'dart:io' show Platform;

/// Configuración de la App que llega por `--dart-define`.
abstract final class Env {
  /// Base de la API. Por defecto, producción (en móviles no hay CORS).
  static const apiUrl = String.fromEnvironment(
    'API_URL',
    defaultValue: 'https://api.ppdguate.com/api',
  );

  /// Valor de `X-App-Platform`: una sesión por plataforma.
  static String get platform => Platform.isIOS ? 'ios' : 'android';
}
