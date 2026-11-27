import 'package:dio/dio.dart';
import 'package:uuid/uuid.dart';

/// Clave de idempotencia para las rutas ♻️ de la API.
///
/// Se crea **una por acción del usuario** (al tocar el botón) y se reutiliza
/// en cada reintento de esa misma acción, para no repetir el efecto.
class IdempotencyKey {
  IdempotencyKey() : value = const Uuid().v4();

  final String value;

  Options get options => Options(headers: {'Idempotency-Key': value});
}
