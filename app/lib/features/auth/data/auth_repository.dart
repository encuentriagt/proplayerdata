import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/config/env.dart';
import '../../../core/network/api_client.dart';
import '../../../core/network/idempotency.dart';
import 'auth_models.dart';

/// Saca `data` de `{data, meta}`; si la respuesta no lo trae, usa el cuerpo.
Map<String, dynamic> _payload(Object? body) {
  if (body is Map && body['data'] is Map) {
    return Map<String, dynamic>.from(body['data'] as Map);
  }
  return body is Map ? Map<String, dynamic>.from(body) : <String, dynamic>{};
}

/// Mensaje de éxito de la API, si lo trae.
String? _message(Object? body) {
  if (body is! Map) return null;
  final msg = body['message'] ?? _payload(body)['message'];
  return msg is String ? msg : null;
}

Options _platform([Options? base]) {
  final options = base ?? Options();
  return options.copyWith(
    headers: {...?options.headers, 'X-App-Platform': Env.platform},
  );
}

enum SocialProvider { google, apple }

class AuthRepository {
  AuthRepository(this._dio);

  final Dio _dio;

  Future<LoginResult> login({
    required String email,
    required String password,
  }) => guardApi(() async {
    final res = await _dio.post<Object?>(
      'auth/login',
      data: {'email': email.trim(), 'password': password},
      options: _platform(),
    );
    return LoginResult.fromJson(_payload(res.data));
  });

  /// ♻️ Crea la cuenta de padre. Responde como el login, con
  /// `must_verify_email: true`, y la API manda un código al correo.
  Future<LoginResult> register({
    required String name,
    required String email,
    String? phone,
    required String password,
    required String passwordConfirmation,
    required IdempotencyKey key,
  }) => guardApi(() async {
    final res = await _dio.post<Object?>(
      'app/auth/register',
      data: {
        'name': name.trim(),
        'email': email.trim(),
        if (phone != null && phone.trim().isNotEmpty) 'phone': phone.trim(),
        'password': password,
        'password_confirmation': passwordConfirmation,
      },
      options: _platform(key.options),
    );
    return LoginResult.fromJson(_payload(res.data));
  });

  /// Crear cuenta o iniciar sesión con Google o Apple.
  Future<LoginResult> social({
    required SocialProvider provider,
    required String idToken,
    String? nonce,
    String? name,
  }) => guardApi(() async {
    final res = await _dio.post<Object?>(
      'app/auth/social',
      data: {
        'provider': provider.name,
        'id_token': idToken,
        'nonce': ?nonce,
        'name': ?name,
      },
      options: _platform(),
    );
    return LoginResult.fromJson(_payload(res.data));
  });

  Future<void> verifyEmail(String code) => guardApi(
    () => _dio.post<Object?>('app/auth/verify-email', data: {'code': code}),
  );

  Future<String?> resendVerification() => guardApi(() async {
    final res = await _dio.post<Object?>('app/auth/verify-email/resend');
    return _message(res.data);
  });

  Future<SessionProfile> me() => guardApi(() async {
    final res = await _dio.get<Object?>('auth/me');
    return SessionProfile.fromJson(_payload(res.data));
  });

  Future<void> logout() => guardApi(() => _dio.post<Object?>('auth/logout'));

  /// ♻️ Cambia la contraseña. [key] se reutiliza si el usuario reintenta.
  Future<void> changePassword({
    required String currentPassword,
    required String password,
    required String passwordConfirmation,
    required IdempotencyKey key,
  }) => guardApi(
    () => _dio.post<Object?>(
      'auth/password',
      data: {
        'current_password': currentPassword,
        'password': password,
        'password_confirmation': passwordConfirmation,
      },
      options: key.options,
    ),
  );

  /// Manda un código al correo (siempre responde lo mismo, exista o no).
  Future<String?> forgotPassword(String email) => guardApi(() async {
    final res = await _dio.post<Object?>(
      'app/auth/password/forgot',
      data: {'email': email.trim()},
    );
    return _message(res.data);
  });

  /// ♻️ Crea una contraseña nueva con el código del correo.
  /// Cierra todas las sesiones: después hay que iniciar sesión.
  Future<void> resetPassword({
    required String email,
    required String code,
    required String password,
    required String passwordConfirmation,
    required IdempotencyKey key,
  }) => guardApi(
    () => _dio.post<Object?>(
      'app/auth/password/reset',
      data: {
        'email': email.trim(),
        'code': code.trim(),
        'password': password,
        'password_confirmation': passwordConfirmation,
      },
      options: key.options,
    ),
  );
}

final authRepositoryProvider = Provider<AuthRepository>(
  (ref) => AuthRepository(ref.watch(dioProvider)),
);
