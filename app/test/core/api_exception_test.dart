import 'package:app/core/network/api_exception.dart';
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('lee code, message y errores por campo', () {
    final e = ApiException.fromResponse(422, {
      'error': {
        'code': 'validation_failed',
        'message': 'Revise los datos.',
        'fields': {
          'email': ['El correo es obligatorio.'],
        },
      },
    });
    expect(e.code, 'validation_failed');
    expect(e.message, 'Revise los datos.');
    expect(e.fieldError('email'), 'El correo es obligatorio.');
    expect(e.fieldError('password'), isNull);
  });

  test('conserva los datos extra del error', () {
    final e = ApiException.fromResponse(423, {
      'error': {
        'code': 'account_locked',
        'message': 'Cuenta bloqueada.',
        'retry_after_minutes': 15,
      },
    });
    expect(e.extra['retry_after_minutes'], 15);
  });

  test('sin respuesta es error de red', () {
    final e = ApiException.fromDio(
      DioException(requestOptions: RequestOptions(path: 'x')),
    );
    expect(e.isNetwork, isTrue);
    expect(e.message, ApiException.networkMessage);
  });

  test('cuerpo inesperado da un mensaje genérico', () {
    final e = ApiException.fromResponse(500, '<html>');
    expect(e.code, 'server_error');
    expect(e.message, ApiException.unknownMessage);
  });
}
