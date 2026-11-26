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
      options: Options(headers: {'X-App-Platform': Env.platform}),
    );
    return LoginResult.fromJson(_payload(res.data));
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

  /// Siempre responde lo mismo, exista o no el correo.
  Future<String?> forgotPassword(String email) => guardApi(() async {
    final res = await _dio.post<Object?>(
      'auth/password/forgot',
      data: {'email': email.trim()},
    );
    final body = res.data;
    if (body is Map) {
      final msg = body['message'] ?? _payload(body)['message'];
      if (msg is String) return msg;
    }
    return null;
  });
}

final authRepositoryProvider = Provider<AuthRepository>(
  (ref) => AuthRepository(ref.watch(dioProvider)),
);
