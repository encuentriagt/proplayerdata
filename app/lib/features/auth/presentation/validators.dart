/// Validaciones locales (la API vuelve a validar y manda sus mensajes).
abstract final class Validators {
  static String? email(String? value) {
    final v = value?.trim() ?? '';
    return RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$').hasMatch(v)
        ? null
        : 'Ingrese un correo electrónico válido.';
  }

  static String? required(String? value, String message) =>
      (value == null || value.trim().isEmpty) ? message : null;

  /// Mínimo 10 caracteres, con letras y números (regla de la API).
  static String? newPassword(String? value) {
    final v = value ?? '';
    if (v.length < 10) return 'Use al menos 10 caracteres.';
    if (!RegExp(r'[A-Za-zÁÉÍÓÚáéíóúÑñ]').hasMatch(v) ||
        !RegExp(r'\d').hasMatch(v)) {
      return 'Use letras y números.';
    }
    return null;
  }

  static String? code(String? value) =>
      RegExp(r'^\d{6}$').hasMatch(value?.trim() ?? '')
      ? null
      : 'Ingrese el código de 6 dígitos.';

  /// Teléfono opcional: 8 a 15 dígitos (se permiten +, espacios y guiones).
  static String? optionalPhone(String? value) {
    final v = value?.trim() ?? '';
    if (v.isEmpty) return null;
    final digits = v.replaceAll(RegExp(r'[\s\-+()]'), '');
    return RegExp(r'^\d{8,15}$').hasMatch(digits)
        ? null
        : 'Ingrese un teléfono válido (ej. 5555 1234).';
  }
}
