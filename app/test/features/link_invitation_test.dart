import 'dart:convert';

import 'package:app/app.dart';
import 'package:app/features/invitations/application/link_invitation.dart';
import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:material_ui/material_ui.dart';

import '../support/fake_api.dart';
import '../support/fake_google.dart';
import '../support/fake_links.dart';
import '../support/fake_photos.dart';

const token = 'tok48caracteresAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
final link = Uri.parse('ppdguate://invitacion?token=$token');

Object? bodyOf(RequestOptions r) =>
    r.data is String ? jsonDecode(r.data as String) : r.data;

/// API con un padre; accept-token vincula a Ana (id 15).
FakeApi linkApi({FakeResponse? acceptResponse}) {
  var linked = false;
  return FakeApi((r) {
    switch (r.path) {
      case 'auth/login':
        return FakeResponse(200, loginJson());
      case 'auth/me':
        return FakeResponse(200, {'data': profileJson()});
      case 'app/invitations':
        return const FakeResponse(200, {'data': []});
      case 'app/events':
        return const FakeResponse(200, {'data': []});
      case 'app/children':
        return FakeResponse(200, {
          'data': [
            if (linked)
              {
                'id': 15,
                'first_name': 'Ana',
                'last_name': 'López',
                'organization': {'id': 1, 'name': 'Colegio A'},
                'teams': [],
              },
          ],
        });
      case 'app/invitations/accept-token':
        if (acceptResponse != null) return acceptResponse;
        linked = true;
        return const FakeResponse(200, {
          'data': {
            'ok': true,
            'child_id': 15,
            'child_first_name': 'Ana',
            'organization_name': 'Colegio A',
          },
        });
    }
    return const FakeResponse(404);
  });
}

Future<void> pumpApp(
  WidgetTester tester,
  FakeApi api,
  FakeLinkSource links, {
  bool signedIn = true,
}) async {
  FlutterSecureStorage.setMockInitialValues({
    if (signedIn) 'ppd.token': 'tok',
    if (signedIn) 'ppd.profile': jsonEncode(profileJson()),
  });
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        api.providerOverride,
        FakeGoogleAuth(isAvailable: false).providerOverride,
        FakePhotoStore().providerOverride,
        links.providerOverride,
      ],
      child: const PpdApp(),
    ),
  );
  await tester.pumpAndSettle();
}

Iterable<RequestOptions> accepts(FakeApi api) =>
    api.requests.where((r) => r.path == 'app/invitations/accept-token');

void main() {
  setUpAll(() => initializeDateFormatting('es'));

  test('lee el token del esquema propio y del App Link', () {
    expect(invitationTokenFrom(link), token);
    expect(
      invitationTokenFrom(
        Uri.parse('https://ppdguate.com/invitacion?token=abc'),
      ),
      'abc',
    );
    expect(
      invitationTokenFrom(
        Uri.parse('https://www.ppdguate.com/invitacion/?token=abc'),
      ),
      'abc',
    );
    expect(
      invitationTokenFrom(Uri.parse('https://otro.com/invitacion?token=a')),
      isNull,
    );
    expect(invitationTokenFrom(Uri.parse('ppdguate://invitacion')), isNull);
    expect(invitationTokenFrom(Uri.parse('ppdguate://otra?token=a')), isNull);
  });

  testWidgets('con sesión: vincula solo y abre la ficha del hijo', (
    tester,
  ) async {
    final api = linkApi();
    await pumpApp(tester, api, FakeLinkSource(link));

    final req = accepts(api).single;
    expect(bodyOf(req), {'token': token});
    expect(req.headers['Idempotency-Key'], isNotEmpty);
    expect(
      find.text('Listo: se vinculó a Ana (Colegio A) con su cuenta.'),
      findsOneWidget,
    );
    expect(find.text('Deportes y equipos'), findsOneWidget); // ficha de Ana
  });

  testWidgets('enlace con la App abierta', (tester) async {
    final api = linkApi();
    final links = FakeLinkSource();
    await pumpApp(tester, api, links);
    expect(accepts(api), isEmpty);

    links.send(Uri.parse('https://ppdguate.com/invitacion?token=$token'));
    await tester.pumpAndSettle();
    expect(accepts(api), hasLength(1));
  });

  testWidgets('sin sesión: guarda el enlace y vincula al entrar', (
    tester,
  ) async {
    final api = linkApi();
    await pumpApp(tester, api, FakeLinkSource(link), signedIn: false);

    expect(accepts(api), isEmpty);
    expect(
      find.textContaining('Para vincular a su hijo, inicie sesión'),
      findsOneWidget,
    );

    await tester.enterText(
      find.widgetWithText(TextFormField, 'Correo electrónico'),
      'marta@example.com',
    );
    await tester.enterText(
      find.widgetWithText(TextFormField, 'Contraseña'),
      'secreta12345',
    );
    await tester.ensureVisible(find.text('Ingresar'));
    await tester.tap(find.text('Ingresar'));
    await tester.pumpAndSettle();

    expect(accepts(api), hasLength(1));
    expect(
      find.text('Listo: se vinculó a Ana (Colegio A) con su cuenta.'),
      findsOneWidget,
    );
  });

  testWidgets('invitación vencida: muestra el mensaje y no reintenta', (
    tester,
  ) async {
    final api = linkApi(
      acceptResponse: FakeResponse(
        410,
        apiError('invitation_closed', 'La invitación ya no está vigente.'),
      ),
    );
    await pumpApp(tester, api, FakeLinkSource(link));
    expect(find.text('La invitación ya no está vigente.'), findsOneWidget);

    // Volver a la App no lo intenta de nuevo (el token se borró).
    final storage = PendingInvitationStore();
    expect(await storage.read(), isNull);
    expect(accepts(api), hasLength(1));
  });
}
