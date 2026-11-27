import 'package:intl/intl.dart';

/// Hora de Guatemala: UTC−6 todo el año (no hay horario de verano).
abstract final class GuatemalaTime {
  static const offset = Duration(hours: -6);

  /// Convierte un instante a la hora de pared de Guatemala.
  ///
  /// El resultado se marca como UTC solo para que no se aplique la zona del
  /// teléfono al formatear; sus campos son la hora local de Guatemala.
  static DateTime toLocal(DateTime instant) => instant.toUtc().add(offset);

  /// Hoy en Guatemala, sin hora.
  static DateTime today() {
    final now = toLocal(DateTime.now());
    return DateTime(now.year, now.month, now.day);
  }

  /// Lee una fecha ISO 8601 de la API (con zona) y la pasa a Guatemala.
  static DateTime parse(String iso) => toLocal(DateTime.parse(iso));

  /// Ej.: «sábado 28 de noviembre».
  static String longDate(DateTime gt) =>
      DateFormat("EEEE d 'de' MMMM", 'es').format(gt);

  /// Ej.: «sáb 28 nov».
  static String shortDate(DateTime gt) =>
      DateFormat('EEE d MMM', 'es').format(gt).replaceAll('.', '');

  /// Ej.: «9:00 a. m.».
  static String time(DateTime gt) => DateFormat.jm('es').format(gt);
}
