import 'dart:convert';

import 'package:app/app.dart';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';

import '../support/fake_api.dart';

Future<void> pumpApp(WidgetTester tester, FakeApi api) async {
  await tester.pumpWidget(
    ProviderScope(overrides: [api.providerOverride], child: const PpdApp()),
  );
  await tester.pumpAndSettle();
}

Future<void> fillLogin(WidgetTester tester) async {
  await tester.enterText(
    find.widgetWithText(TextFormField, 'Correo electrónico'),
    'marta@example.com',
  );
  await tester.enterText(
    find.widgetWithText(TextFormField, 'Contraseña'),
    'secreta12345',
  );
  await tester.tap(find.text('Ingresar'));
  await tester.pumpAndSettle();
}

Object? bodyOf(RequestOptions r) =>
    r.data is String ? jsonDecode(r.data as String) : r.data;

void main() {
  setUpAll(() => initializeDateFormatting('es'));
  setUp(() => FlutterSecureStorage.setMockInitialValues({}));

  testWidgets('padre inicia sesión y llega al inicio', (tester) async {
    final api = FakeApi((r) {
      if (r.path == 'auth/login') return FakeResponse(200, loginJson());
      return const FakeResponse(404);
    });
    await pumpApp(tester, api);
    expect(find.text('Iniciar sesión'), findsOneWidget);

    await fillLogin(tester);

    expect(find.text('Hola, Marta López.'), findsOneWidget);
    final login = api.requests.firstWhere((r) => r.path == 'auth/login');
    expect(login.headers['X-App-Platform'], isIn(['android', 'ios']));
    expect(bodyOf(login), {
      'email': 'marta@example.com',
      'password': 'secreta12345',
    });
  });

  testWidgets('credenciales inválidas muestran el mensaje de la API', (
    tester,
  ) async {
    final api = FakeApi(
      (_) => FakeResponse(
        422,
        apiError(
          'invalid_credentials',
          'El correo o la contraseña no son correctos.',
        ),
      ),
    );
    await pumpApp(tester, api);
    await fillLogin(tester);
    expect(
      find.text('El correo o la contraseña no son correctos.'),
      findsOneWidget,
    );
    expect(find.text('Iniciar sesión'), findsOneWidget);
  });

  testWidgets('contraseña temporal obliga a cambiarla y luego entra', (
    tester,
  ) async {
    var changed = false;
    final api = FakeApi((r) {
      switch (r.path) {
        case 'auth/login':
          return FakeResponse(200, loginJson(mustChange: true));
        case 'auth/password':
          changed = true;
          return const FakeResponse(200, {'data': null});
        case 'auth/me':
          return FakeResponse(200, {'data': profileJson()});
      }
      return const FakeResponse(404);
    });
    await pumpApp(tester, api);
    await fillLogin(tester);

    expect(
      find.text(
        'Por seguridad, cambie la contraseña temporal antes de continuar.',
      ),
      findsOneWidget,
    );
    await tester.enterText(
      find.widgetWithText(TextFormField, 'Contraseña temporal'),
      'temporal123',
    );
    await tester.enterText(
      find.widgetWithText(TextFormField, 'Nueva contraseña'),
      'nueva123456',
    );
    await tester.enterText(
      find.widgetWithText(TextFormField, 'Confirme la nueva contraseña'),
      'nueva123456',
    );
    await tester.tap(find.text('Guardar contraseña'));
    await tester.pumpAndSettle();

    expect(changed, isTrue);
    final req = api.requests.firstWhere((r) => r.path == 'auth/password');
    expect(req.headers['Idempotency-Key'], isNotEmpty);
    expect(find.text('Hola, Marta López.'), findsOneWidget);
  });

  testWidgets('quien no es padre ve el aviso de la PC', (tester) async {
    final api = FakeApi((r) {
      if (r.path == 'auth/login') {
        return FakeResponse(200, loginJson(guardian: false));
      }
      return const FakeResponse(200, {'data': null});
    });
    await pumpApp(tester, api);
    await fillLogin(tester);
    expect(find.textContaining('pc.ppdguate.com'), findsOneWidget);

    await tester.tap(find.text('Cerrar sesión'));
    await tester.pumpAndSettle();
    expect(find.text('Iniciar sesión'), findsOneWidget);
  });

  testWidgets('sesión guardada entra directo; 401 vuelve al login', (
    tester,
  ) async {
    FlutterSecureStorage.setMockInitialValues({
      'ppd.token': 'tok-viejo',
      'ppd.profile': jsonEncode(profileJson()),
    });
    final api = FakeApi(
      (_) => FakeResponse(401, apiError('unauthenticated', 'Inicie sesión.')),
    );
    await pumpApp(tester, api);
    expect(
      find.text('Su sesión venció. Inicie sesión de nuevo.'),
      findsOneWidget,
    );
  });
}
