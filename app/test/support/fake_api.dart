import 'dart:convert';
import 'dart:typed_data';

import 'package:app/core/network/api_client.dart';
import 'package:app/core/storage/session_storage.dart';
import 'package:dio/dio.dart';
import 'package:flutter_riverpod/misc.dart';

/// Respuesta simulada de la API.
class FakeResponse {
  const FakeResponse(this.status, [this.body]);
  final int status;
  final Object? body;
}

typedef FakeHandler = FakeResponse Function(RequestOptions request);

/// Adaptador HTTP que responde sin red y guarda las peticiones recibidas.
class FakeApi implements HttpClientAdapter {
  FakeApi(this.handler);

  FakeHandler handler;
  final requests = <RequestOptions>[];

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    requests.add(options);
    final r = handler(options);
    return ResponseBody.fromString(
      r.body == null ? '' : jsonEncode(r.body),
      r.status,
      headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
      },
    );
  }

  @override
  void close({bool force = false}) {}

  /// Sobrescribe el cliente HTTP de la App para usar este adaptador.
  Override get providerOverride => dioProvider.overrideWith(
    (ref) => buildDio(
      storage: ref.watch(sessionStorageProvider),
      events: ref.watch(apiEventsProvider),
      baseUrl: 'https://api.test/api',
      adapter: this,
    ),
  );
}

Map<String, dynamic> apiError(String code, String message, [Map? fields]) => {
  'error': {'code': code, 'message': message, 'fields': ?fields},
};

Map<String, dynamic> profileJson({
  bool mustChange = false,
  bool mustVerify = false,
  bool passwordSet = true,
}) => {
  'user': {
    'id': 7,
    'name': 'Marta López',
    'email': 'marta@example.com',
    'account_type': 'guardian',
    'phone': null,
    'must_change_password': mustChange,
    'email_verified': !mustVerify,
    'password_set': passwordSet,
    'linked': passwordSet ? <String>[] : ['google'],
    'is_super_admin': false,
  },
  'memberships': <Object>[],
  'is_guardian': true,
  'must_verify_email': mustVerify,
  'admin_totp': null,
};

Map<String, dynamic> loginJson({
  bool mustChange = false,
  bool mustVerify = false,
  bool passwordSet = true,
  bool? created,
}) => {
  'data': {
    'token': 'tok-123',
    'token_type': 'Bearer',
    'expires_at': '2026-12-26T09:00:00-06:00',
    ...profileJson(
      mustChange: mustChange,
      mustVerify: mustVerify,
      passwordSet: passwordSet,
    ),
    'created': ?created,
  },
};
