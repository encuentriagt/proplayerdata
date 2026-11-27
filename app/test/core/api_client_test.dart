import 'package:app/core/network/api_client.dart';
import 'package:app/core/network/api_exception.dart';
import 'package:app/core/network/idempotency.dart';
import 'package:app/core/storage/session_storage.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';

import '../support/fake_api.dart';

void main() {
  late FakeApi api;
  late ApiEvents events;
  late SessionStorage storage;

  setUp(() {
    FlutterSecureStorage.setMockInitialValues({'ppd.token': 'tok-abc'});
    storage = SessionStorage();
    events = ApiEvents();
    api = FakeApi((_) => const FakeResponse(200, {'data': {}}));
  });

  test('envía Accept y el token guardado', () async {
    final dio = buildDio(storage: storage, events: events, adapter: api);
    await dio.get<Object?>('auth/me');
    final headers = api.requests.single.headers;
    expect(headers['Accept'], 'application/json');
    expect(headers['Authorization'], 'Bearer tok-abc');
  });

  test('la clave de idempotencia se reutiliza en el reintento', () async {
    final dio = buildDio(storage: storage, events: events, adapter: api);
    final key = IdempotencyKey();
    await dio.post<Object?>('auth/password', options: key.options);
    await dio.post<Object?>('auth/password', options: key.options);
    final sent = api.requests.map((r) => r.headers['Idempotency-Key']).toSet();
    expect(sent, {key.value});
    expect(IdempotencyKey().value, isNot(key.value));
  });

  test('401 avisa a la sesión y lanza ApiException', () async {
    var unauthorized = 0;
    events.onUnauthorized = () => unauthorized++;
    api.handler = (_) =>
        FakeResponse(401, apiError('unauthenticated', 'Inicie sesión.'));
    final dio = buildDio(storage: storage, events: events, adapter: api);
    await expectLater(
      guardApi(() => dio.get<Object?>('auth/me')),
      throwsA(
        isA<ApiException>().having((e) => e.code, 'code', 'unauthenticated'),
      ),
    );
    expect(unauthorized, 1);
  });

  test('password_change_required avisa a la sesión', () async {
    var required = 0;
    events.onPasswordChangeRequired = () => required++;
    api.handler = (_) => FakeResponse(
      403,
      apiError('password_change_required', 'Cambie su contraseña.'),
    );
    final dio = buildDio(storage: storage, events: events, adapter: api);
    await expectLater(
      guardApi(() => dio.get<Object?>('app/children')),
      throwsA(isA<ApiException>()),
    );
    expect(required, 1);
  });
}
