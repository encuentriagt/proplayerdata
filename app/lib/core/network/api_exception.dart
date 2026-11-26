import 'package:dio/dio.dart';

/// Error de la API. La App decide por [code] (estable) y muestra [message].
class ApiException implements Exception {
  const ApiException({
    required this.status,
    required this.code,
    required this.message,
    this.fields = const {},
    this.extra = const {},
  });

  /// Código HTTP; 0 si no hubo respuesta (sin conexión).
  final int status;
  final String code;
  final String message;

  /// Errores por campo cuando `code == validation_failed` (ya en español).
  final Map<String, List<String>> fields;

  /// Datos adicionales del error (p. ej. `retry_after_minutes`).
  final Map<String, dynamic> extra;

  static const networkMessage =
      'No hay conexión. Revise su señal e intente de nuevo.';
  static const unknownMessage =
      'Ocurrió un error inesperado. Intente de nuevo más tarde.';

  bool get isNetwork => code == 'network_error';

  /// Primer mensaje de un campo, para mostrarlo debajo del campo.
  String? fieldError(String field) {
    final list = fields[field];
    return (list == null || list.isEmpty) ? null : list.first;
  }

  factory ApiException.fromDio(DioException e) {
    final response = e.response;
    if (response == null) {
      return const ApiException(
        status: 0,
        code: 'network_error',
        message: networkMessage,
      );
    }
    return ApiException.fromResponse(response.statusCode ?? 0, response.data);
  }

  factory ApiException.fromResponse(int status, Object? body) {
    final error = body is Map && body['error'] is Map
        ? Map<String, dynamic>.from(body['error'] as Map)
        : null;
    if (error == null) {
      return ApiException(
        status: status,
        code: status == 401 ? 'unauthenticated' : 'server_error',
        message: unknownMessage,
      );
    }
    final fields = <String, List<String>>{};
    final rawFields = error['fields'];
    if (rawFields is Map) {
      rawFields.forEach((key, value) {
        if (value is List) {
          fields['$key'] = value.map((v) => '$v').toList();
        } else if (value != null) {
          fields['$key'] = ['$value'];
        }
      });
    }
    final extra = Map<String, dynamic>.from(error)
      ..remove('code')
      ..remove('message')
      ..remove('fields');
    return ApiException(
      status: status,
      code: (error['code'] as String?) ?? 'server_error',
      message: (error['message'] as String?) ?? unknownMessage,
      fields: fields,
      extra: extra,
    );
  }

  @override
  String toString() => 'ApiException($status, $code)';
}
