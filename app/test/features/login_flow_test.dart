import 'dart:convert';

import 'package:app/app.dart';
import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:material_ui/material_ui.dart';

import '../support/fake_api.dart';
import '../support/fake_google.dart';
import '../support/fake_photos.dart';

Future<void> pumpApp(
  WidgetTester tester,
  FakeApi api, {
  FakeGoogleAuth? google,
}) async {
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        api.providerOverride,
        (google ?? FakeGoogleAuth(isAvailable: false)).providerOverride,
        FakePhotoStore().providerOverride,
      ],
      child: const PpdApp(),
    ),
  );
  await tester.pumpAndSettle();
}

Finder field(String label) => find.widgetWithText(TextFormField, label);

Future<void> tapText(WidgetTester tester, String text) async {
  await tester.ensureVisible(find.text(text).last);
  await tester.tap(find.text(text).last);
  await tester.pumpAndSettle();
}

Future<void> fillLogin(WidgetTester tester) async {
  await tester.enterText(field('Correo electrónico'), 'marta@example.com');
  await tester.enterText(field('Contraseña'), 'secreta12345');
  await tapText(tester, 'Ingresar');
}

Object? bodyOf(RequestOptions r) =>
    r.data is String ? jsonDecode(r.data as String) : r.data;

RequestOptions sent(FakeApi api, String path) =>
    api.requests.lastWhere((r) => r.path == path);

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
    expect(find.text('Continuar con Google'), findsNothing);

    await fillLogin(tester);

    expect(find.text('Calendario'), findsWidgets);
    final login = sent(api, 'auth/login');
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

  testWidgets('registro, verificación del correo y entrada', (tester) async {
    final api = FakeApi((r) {
      switch (r.path) {
        case 'app/auth/register':
          return FakeResponse(201, loginJson(mustVerify: true));
        case 'app/auth/verify-email':
          final code = (bodyOf(r) as Map)['code'];
          if (code != '123456') {
            return FakeResponse(
              422,
              apiError('code_invalid', 'El código no es correcto.'),
            );
          }
          return const FakeResponse(200, {
            'data': {'ok': true, 'email_verified': true},
          });
        case 'auth/me':
          return FakeResponse(200, {'data': profileJson()});
      }
      return const FakeResponse(404);
    });
    await pumpApp(tester, api);
    await tapText(tester, 'Crear cuenta');

    await tester.enterText(field('Nombre completo'), 'Marta López');
    await tester.enterText(field('Correo electrónico'), 'marta@example.com');
    await tester.enterText(field('Teléfono (opcional)'), '5555 1234');
    await tester.enterText(field('Contraseña'), 'clave123456');
    await tester.enterText(field('Confirme la contraseña'), 'clave123456');
    final submit = find.widgetWithText(FilledButton, 'Crear cuenta');
    await tester.ensureVisible(submit);
    await tester.tap(submit);
    await tester.pumpAndSettle();

    final register = sent(api, 'app/auth/register');
    expect(register.headers['X-App-Platform'], isIn(['android', 'ios']));
    expect(register.headers['Idempotency-Key'], isNotEmpty);
    expect((bodyOf(register) as Map)['phone'], '5555 1234');

    // Verificación obligatoria.
    expect(find.text('Verifique su correo'), findsOneWidget);
    await tester.enterText(field('Código de 6 dígitos'), '000000');
    await tapText(tester, 'Verificar');
    expect(find.text('El código no es correcto.'), findsOneWidget);

    await tester.enterText(field('Código de 6 dígitos'), '123456');
    await tapText(tester, 'Verificar');
    expect(find.text('Calendario'), findsWidgets);
  });

  testWidgets('contraseña olvidada con código', (tester) async {
    final api = FakeApi((r) {
      switch (r.path) {
        case 'app/auth/password/forgot':
          return const FakeResponse(200, {'message': 'Revise su correo.'});
        case 'app/auth/password/reset':
          return const FakeResponse(200, {'data': null});
      }
      return const FakeResponse(404);
    });
    await pumpApp(tester, api);
    await tapText(tester, '¿Olvidó su contraseña?');

    await tester.enterText(field('Correo electrónico'), 'marta@example.com');
    await tapText(tester, 'Enviar código');
    expect(find.text('Revise su correo.'), findsOneWidget);

    await tester.enterText(field('Código de 6 dígitos'), '654321');
    await tester.enterText(field('Contraseña nueva'), 'nueva123456');
    await tester.enterText(
      field('Confirme la contraseña nueva'),
      'nueva123456',
    );
    await tapText(tester, 'Guardar contraseña');

    final reset = sent(api, 'app/auth/password/reset');
    expect(bodyOf(reset), {
      'email': 'marta@example.com',
      'code': '654321',
      'password': 'nueva123456',
      'password_confirmation': 'nueva123456',
    });
    expect(reset.headers['Idempotency-Key'], isNotEmpty);
    expect(find.text('Iniciar sesión'), findsOneWidget);
  });

  testWidgets('continuar con Google manda el id_token y entra', (tester) async {
    final google = FakeGoogleAuth();
    final api = FakeApi((r) {
      if (r.path == 'app/auth/social') {
        return FakeResponse(201, loginJson(passwordSet: false, created: true));
      }
      return const FakeResponse(200, {'data': null});
    });
    await pumpApp(tester, api, google: google);
    await tapText(tester, 'Continuar con Google');

    final social = sent(api, 'app/auth/social');
    expect(bodyOf(social), {
      'provider': 'google',
      'id_token': 'google-id-token',
    });
    expect(social.headers['X-App-Platform'], isIn(['android', 'ios']));
    expect(find.text('Calendario'), findsWidgets);

    // Al cerrar sesión también se cierra la de Google.
    await tester.tap(find.byTooltip('Opciones'));
    await tester.pumpAndSettle();
    await tapText(tester, 'Cerrar sesión');
    expect(google.signOuts, 1);
    expect(find.text('Iniciar sesión'), findsOneWidget);
  });

  testWidgets('cancelar Google no hace nada', (tester) async {
    final api = FakeApi((_) => const FakeResponse(404));
    await pumpApp(tester, api, google: FakeGoogleAuth(token: null));
    await tapText(tester, 'Continuar con Google');
    expect(api.requests, isEmpty);
    expect(find.text('Iniciar sesión'), findsOneWidget);
  });

  testWidgets('email_unverified en cualquier llamada lleva a verificar', (
    tester,
  ) async {
    FlutterSecureStorage.setMockInitialValues({
      'ppd.token': 'tok',
      'ppd.profile': jsonEncode(profileJson()),
    });
    final api = FakeApi(
      (_) => FakeResponse(
        403,
        apiError('email_unverified', 'Verifique su correo.'),
      ),
    );
    await pumpApp(tester, api);
    expect(find.text('Verifique su correo'), findsOneWidget);
  });

  testWidgets('sesión guardada con 401 vuelve al login', (tester) async {
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
