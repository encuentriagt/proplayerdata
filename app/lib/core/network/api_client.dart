import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../config/env.dart';
import '../storage/session_storage.dart';
import 'api_exception.dart';

/// Avisos globales que el cliente HTTP necesita dar a la sesión.
class ApiEvents {
  /// 401: el token ya no sirve; volver al login.
  void Function()? onUnauthorized;

  /// 403 `password_change_required`: llevar al cambio de contraseña.
  void Function()? onPasswordChangeRequired;
}

final apiEventsProvider = Provider<ApiEvents>((ref) => ApiEvents());

/// Crea el cliente HTTP de la API con los encabezados y el manejo de errores.
Dio buildDio({
  required SessionStorage storage,
  required ApiEvents events,
  String baseUrl = Env.apiUrl,
  HttpClientAdapter? adapter,
}) {
  final dio = Dio(
    BaseOptions(
      baseUrl: baseUrl.endsWith('/') ? baseUrl : '$baseUrl/',
      connectTimeout: const Duration(seconds: 15),
      receiveTimeout: const Duration(seconds: 30),
      headers: {'Accept': 'application/json'},
      contentType: Headers.jsonContentType,
      responseType: ResponseType.json,
    ),
  );
  if (adapter != null) dio.httpClientAdapter = adapter;

  dio.interceptors.add(
    InterceptorsWrapper(
      onRequest: (options, handler) async {
        final token = await storage.readToken();
        if (token != null && !options.headers.containsKey('Authorization')) {
          options.headers['Authorization'] = 'Bearer $token';
        }
        handler.next(options);
      },
      onError: (e, handler) {
        final error = ApiException.fromDio(e);
        if (error.status == 401) {
          events.onUnauthorized?.call();
        } else if (error.code == 'password_change_required') {
          events.onPasswordChangeRequired?.call();
        }
        handler.reject(
          DioException(
            requestOptions: e.requestOptions,
            response: e.response,
            type: e.type,
            error: error,
          ),
        );
      },
    ),
  );
  return dio;
}

final dioProvider = Provider<Dio>(
  (ref) => buildDio(
    storage: ref.watch(sessionStorageProvider),
    events: ref.watch(apiEventsProvider),
  ),
);

/// Ejecuta una llamada y convierte cualquier falla en [ApiException].
Future<T> guardApi<T>(Future<T> Function() call) async {
  try {
    return await call();
  } on DioException catch (e) {
    final inner = e.error;
    throw inner is ApiException ? inner : ApiException.fromDio(e);
  }
}
