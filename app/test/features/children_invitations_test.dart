import 'dart:convert';

import 'package:app/app.dart';
import 'package:app/features/children/data/children_models.dart';
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

Map<String, dynamic> childJson({
  int id = 15,
  String first = 'Ana',
  String org = 'Colegio A',
}) => {
  'id': id,
  'first_name': first,
  'last_name': 'López',
  'birthdate': '2014-03-10',
  'photo_url': null,
  'organization': {
    'id': 1,
    'name': org,
    'slug': 'colegio-a',
    'logo_url': null,
    'crest_url': null,
    'colors': {'primary': '#123456'},
  },
  'teams': [
    {
      'id': 3,
      'name': 'Sub-12',
      'category': 'Sub-12',
      'sport': {'id': 1, 'code': 'soccer', 'name': 'Soccer'},
      'season': {'id': 2, 'name': '2026'},
      'jersey_number': 9,
      'position': {'id': 4, 'name': 'Delantera'},
    },
    {
      'id': 8,
      'name': 'Mini Basket',
      'category': null,
      'sport': {'id': 2, 'code': 'basketball', 'name': 'Basketball'},
      'season': null,
      'jersey_number': null,
      'position': null,
    },
  ],
  'plan_level': 'free',
};

Map<String, dynamic> invitationJson() => {
  'id': 40,
  'organization': {'id': 2, 'name': 'Colegio B', 'crest_url': null},
  'player': {'first_name': 'Luis'},
  'teams': [
    {
      'name': 'Juvenil',
      'sport': {'code': 'volleyball', 'name': 'Volleyball'},
    },
  ],
  'expires_at': '2026-12-10T23:59:00-06:00',
};

/// API simulada con estado: hijos e invitaciones que cambian al aceptar.
class FamilyApi {
  final children = <Map<String, dynamic>>[childJson()];
  final invitations = <Map<String, dynamic>>[invitationJson()];

  late final api = FakeApi((r) {
    switch ((r.method, r.path)) {
      case ('GET', 'auth/me'):
        return FakeResponse(200, {'data': profileJson()});
      case ('GET', 'app/children'):
        return FakeResponse(200, {'data': children});
      case ('GET', 'app/invitations'):
        return FakeResponse(200, {'data': invitations});
      case ('POST', 'app/invitations/40/accept'):
        invitations.clear();
        children.add(childJson(id: 22, first: 'Luis', org: 'Colegio B'));
        return const FakeResponse(200, {
          'data': {'ok': true, 'child_id': 22},
        });
      case ('POST', 'app/invitations/40/decline'):
        invitations.clear();
        return const FakeResponse(200, {'data': null});
      case ('POST', 'app/invitations/redeem'):
        final code = (bodyOf(r) as Map)['code'];
        if (code != 'ABCD-2345') {
          return FakeResponse(
            422,
            apiError('code_invalid', 'El código no es válido.'),
          );
        }
        children.add(childJson(id: 30, first: 'Sofía', org: 'Colegio C'));
        return const FakeResponse(200, {
          'data': {'ok': true, 'child_id': 30},
        });
      case ('DELETE', 'app/children/15'):
        children.removeWhere((c) => c['id'] == 15);
        return const FakeResponse(200, {'data': null});
    }
    return const FakeResponse(404);
  });
}

Future<void> pumpSignedIn(WidgetTester tester, FakeApi api) async {
  FlutterSecureStorage.setMockInitialValues({
    'ppd.token': 'tok',
    'ppd.profile': jsonEncode(profileJson()),
  });
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        api.providerOverride,
        FakeGoogleAuth(isAvailable: false).providerOverride,
        FakePhotoStore().providerOverride,
        FakeLinkSource().providerOverride,
      ],
      child: const PpdApp(),
    ),
  );
  await tester.pumpAndSettle();
  await tester.tap(find.text('Mis hijos').first);
  await tester.pumpAndSettle();
}

Future<void> tap(WidgetTester tester, Finder finder) async {
  await tester.ensureVisible(finder);
  await tester.pumpAndSettle();
  await tester.tap(finder);
  await tester.pumpAndSettle();
}

Object? bodyOf(RequestOptions r) =>
    r.data is String ? jsonDecode(r.data as String) : r.data;

RequestOptions sent(FakeApi api, String method, String path) =>
    api.requests.lastWhere((r) => r.method == method && r.path == path);

void main() {
  setUpAll(() => initializeDateFormatting('es'));

  test('Child: nombre, iniciales, deportes sin repetir y edad', () {
    final c = Child.fromJson(childJson());
    expect(c.fullName, 'Ana López');
    expect(c.initials, 'AL');
    expect(c.sports.map((s) => s.name), ['Soccer', 'Basketball']);
    expect(c.teams.first.jerseyNumber, '9');
    expect(c.ageOn(DateTime(2026, 3, 9)), 11);
    expect(c.ageOn(DateTime(2026, 3, 10)), 12);
  });

  testWidgets('inicio muestra hijos y el aviso de invitaciones', (
    tester,
  ) async {
    final family = FamilyApi();
    await pumpSignedIn(tester, family.api);

    expect(find.text('Hola, Marta'), findsOneWidget);
    expect(find.text('Tiene 1 invitación pendiente'), findsOneWidget);
    expect(find.text('Ana López'), findsOneWidget);
    expect(find.text('Colegio A'), findsOneWidget);
    expect(find.text('Soccer'), findsOneWidget);
    expect(find.text('Basketball'), findsOneWidget);
  });

  testWidgets('aceptar una invitación vincula al hijo de otro colegio', (
    tester,
  ) async {
    final family = FamilyApi();
    await pumpSignedIn(tester, family.api);

    await tap(tester, find.text('Tiene 1 invitación pendiente'));
    expect(find.text('Vincular a Luis'), findsOneWidget);
    expect(find.text('Volleyball · Juvenil'), findsOneWidget);

    await tap(tester, find.widgetWithText(FilledButton, 'Aceptar'));
    final accept = sent(family.api, 'POST', 'app/invitations/40/accept');
    expect(accept.headers['Idempotency-Key'], isNotEmpty);
    expect(find.text('No tiene invitaciones pendientes'), findsOneWidget);

    await tap(tester, find.byTooltip('Atrás'));
    expect(find.text('Luis López'), findsOneWidget);
    expect(find.text('Colegio B'), findsOneWidget);
    expect(find.text('Tiene 1 invitación pendiente'), findsNothing);
  });

  testWidgets('rechazar pide confirmación', (tester) async {
    final family = FamilyApi();
    await pumpSignedIn(tester, family.api);
    await tap(tester, find.text('Tiene 1 invitación pendiente'));

    await tap(tester, find.widgetWithText(OutlinedButton, 'Rechazar'));
    expect(find.text('¿Rechazar la invitación?'), findsOneWidget);
    await tap(tester, find.widgetWithText(TextButton, 'Rechazar'));

    expect(
      family.api.requests.any((r) => r.path == 'app/invitations/40/decline'),
      isTrue,
    );
    expect(find.text('No tiene invitaciones pendientes'), findsOneWidget);
  });

  testWidgets('vincular con código: malo muestra error, bueno abre la ficha', (
    tester,
  ) async {
    final family = FamilyApi();
    await pumpSignedIn(tester, family.api);

    await tap(tester, find.byTooltip('Opciones'));
    await tap(tester, find.text('Tengo un código'));

    final field = find.widgetWithText(TextFormField, 'Código de vinculación');
    await tester.enterText(field, 'zzzz-9999');
    await tap(tester, find.text('Vincular'));
    expect(find.text('El código no es válido.'), findsOneWidget);

    await tester.enterText(field, 'abcd-2345');
    await tap(tester, find.text('Vincular'));
    final redeem = sent(family.api, 'POST', 'app/invitations/redeem');
    expect(bodyOf(redeem), {'code': 'ABCD-2345'});
    expect(redeem.headers['Idempotency-Key'], isNotEmpty);

    // Abre la ficha del hijo recién vinculado.
    expect(find.text('Sofía López'), findsOneWidget);
    expect(find.text('Colegio C'), findsOneWidget);
  });

  testWidgets('ficha del hijo y desvincular', (tester) async {
    final family = FamilyApi();
    await pumpSignedIn(tester, family.api);

    await tap(tester, find.text('Ana López'));
    expect(find.text('Deportes y equipos'), findsOneWidget);
    expect(find.text('Sub-12'), findsWidgets);
    expect(find.textContaining('Dorsal 9 · Delantera'), findsOneWidget);
    expect(find.text('Mini Basket'), findsOneWidget);

    await tester.scrollUntilVisible(
      find.text('Desvincular a Ana'),
      200,
      scrollable: find.byType(Scrollable).last,
    );
    await tap(tester, find.text('Desvincular a Ana'));
    expect(find.text('¿Desvincular a Ana?'), findsOneWidget);
    await tap(tester, find.widgetWithText(TextButton, 'Desvincular'));

    expect(
      family.api.requests.any(
        (r) => r.method == 'DELETE' && r.path == 'app/children/15',
      ),
      isTrue,
    );
    expect(find.text('Hola, Marta'), findsOneWidget);
    expect(find.text('Ana López'), findsNothing);
  });

  testWidgets('sin hijos: explica cómo vincular', (tester) async {
    final family = FamilyApi()
      ..children.clear()
      ..invitations.clear();
    await pumpSignedIn(tester, family.api);
    expect(find.text('Aún no tiene hijos vinculados'), findsOneWidget);
    expect(
      find.widgetWithText(FilledButton, 'Tengo un código'),
      findsOneWidget,
    );
  });
}
