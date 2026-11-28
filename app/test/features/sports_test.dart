import 'dart:convert';

import 'package:app/app.dart';
import 'package:app/core/time/guatemala_time.dart';
import 'package:app/features/children/data/children_models.dart';
import 'package:app/features/sports/data/sport_models.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:material_ui/material_ui.dart';

import '../support/fake_api.dart';
import '../support/fake_google.dart';
import '../support/fake_links.dart';
import '../support/fake_photos.dart';

Map<String, dynamic> sport(int id, String code, String name) => {
  'id': id,
  'code': code,
  'name': name,
};

final soccer = sport(1, 'soccer', 'Soccer');
final basketball = sport(2, 'basketball', 'Basketball');
final baseball = sport(5, 'baseball', 'Baseball');

Map<String, dynamic> team(int id, String name, Map<String, dynamic> s) => {
  'id': id,
  'name': name,
  'sport': s,
};

/// Hijo A en el colegio A (fútbol y básquet); hijo B en el colegio B
/// (fútbol y béisbol).
final apiChildren = [
  {
    'id': 15,
    'first_name': 'Ana',
    'last_name': 'López',
    'organization': {'id': 1, 'name': 'Colegio A'},
    'teams': [team(3, 'Sub-12 A', soccer), team(8, 'Mini Basket', basketball)],
  },
  {
    'id': 22,
    'first_name': 'Beto',
    'last_name': 'López',
    'organization': {'id': 2, 'name': 'Colegio B'},
    'teams': [
      team(30, 'Sub-10 B', soccer),
      team(31, 'Pequeñas Ligas', baseball),
    ],
  },
];

String isoIn(int days, int hour) {
  final d = GuatemalaTime.today().add(Duration(days: days));
  String two(int n) => n.toString().padLeft(2, '0');
  return '${d.year}-${two(d.month)}-${two(d.day)}T${two(hour)}:00:00-06:00';
}

Map<String, dynamic> event(
  int id,
  String type,
  String title,
  int days,
  Map<String, dynamic> t,
  String org,
  List<(int, String)> kids,
) => {
  'id': id,
  'team_id': t['id'],
  'type': type,
  'display_title': title,
  'starts_at': isoIn(days, 10),
  'status': 'scheduled',
  'team': {'id': t['id'], 'name': t['name']},
  'sport': t['sport'],
  'organization': {'id': 1, 'name': org},
  'children': [
    for (final (id, name) in kids)
      {
        'child_id': id,
        'first_name': name,
        'callup': {'status': 'called', 'response': null},
      },
  ],
};

Map<String, dynamic> teamOf(int child, int index) =>
    (apiChildren[child]['teams']! as List)[index] as Map<String, dynamic>;

final apiEvents = [
  event(1, 'match', 'Sub-12 A vs Tigres', 3, teamOf(0, 0), 'Colegio A', [
    (15, 'Ana'),
  ]),
  event(2, 'match', 'Sub-10 B vs Águilas', -5, teamOf(1, 0), 'Colegio B', [
    (22, 'Beto'),
  ]),
  event(3, 'training', 'Sub-12 A · Entreno', 1, teamOf(0, 0), 'Colegio A', [
    (15, 'Ana'),
  ]),
  event(4, 'match', 'Pequeñas Ligas vs Leones', 2, teamOf(1, 1), 'Colegio B', [
    (22, 'Beto'),
  ]),
];

FakeApi sportsApi() => FakeApi((r) {
  switch (r.path) {
    case 'auth/me':
      return FakeResponse(200, {'data': profileJson()});
    case 'app/children':
      return FakeResponse(200, {'data': apiChildren});
    case 'app/invitations':
      return const FakeResponse(200, {'data': []});
    case 'app/events':
      final sid = int.tryParse('${r.queryParameters['sport_id'] ?? ''}');
      return FakeResponse(200, {
        'data': [
          for (final e in apiEvents)
            if (sid == null || (e['sport'] as Map)['id'] == sid) e,
        ],
        'meta': {'history_limited': false},
      });
    case 'app/children/15/stats':
      return const FakeResponse(200, {
        'data': {
          'by_sport': [
            {
              'sport_id': 1,
              'matches': 4,
              'minutes': 200,
              'stats': [
                {'code': 'goal', 'name': 'Goles', 'value': 3},
              ],
            },
          ],
          'attendance': {'present': 5},
        },
        'meta': {'limited': false},
      });
    case 'app/children/22/stats':
      return const FakeResponse(200, {
        'data': {'by_sport': [], 'attendance': {}},
        'meta': {'limited': false},
      });
  }
  return const FakeResponse(404);
});

Future<void> pumpSports(WidgetTester tester) async {
  FlutterSecureStorage.setMockInitialValues({
    'ppd.token': 'tok',
    'ppd.profile': jsonEncode(profileJson()),
  });
  tester.view.physicalSize = const Size(1080, 2400);
  tester.view.devicePixelRatio = 2.5;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        sportsApi().providerOverride,
        FakeGoogleAuth(isAvailable: false).providerOverride,
        FakePhotoStore().providerOverride,
        FakeLinkSource().providerOverride,
      ],
      child: const PpdApp(),
    ),
  );
  await tester.pumpAndSettle();
  await tester.tap(find.text('Deportes').first);
  await tester.pumpAndSettle();
}

Future<void> tap(WidgetTester tester, Finder finder) async {
  await tester.ensureVisible(finder);
  await tester.pumpAndSettle();
  await tester.tap(finder);
  await tester.pumpAndSettle();
}

void main() {
  setUpAll(() => initializeDateFormatting('es'));

  test('junta los deportes de todos los hijos sin repetir', () {
    final kids = apiChildren.map(Child.fromJson).toList();
    final sports = buildSportSummaries(kids);
    expect(sports.map((s) => s.sport.name), [
      'Soccer',
      'Basketball',
      'Baseball',
    ]);
    final futbol = sports.first;
    expect(futbol.children.map((c) => c.firstName), ['Ana', 'Beto']);
    expect(futbol.teamIds, {3, 30});
    expect(sports[2].children.map((c) => c.firstName), ['Beto']);
  });

  testWidgets('pestaña Deportes muestra todos los deportes y quién juega', (
    tester,
  ) async {
    await pumpSports(tester);
    expect(find.text('SOCCER'), findsOneWidget);
    expect(find.text('BASKETBALL'), findsOneWidget);
    expect(find.text('BASEBALL'), findsOneWidget);
    expect(find.textContaining('Colegio A · Sub-12 A'), findsOneWidget);
    expect(find.textContaining('Colegio B · Sub-10 B'), findsOneWidget);
    expect(find.textContaining('Colegio B · Pequeñas Ligas'), findsOneWidget);
  });

  testWidgets('fútbol: partidos de los dos hijos, entrenos y estadísticas', (
    tester,
  ) async {
    await pumpSports(tester);
    await tap(tester, find.text('SOCCER'));

    // Partidos: próximo de Ana (colegio A) y reciente de Beto (colegio B).
    expect(find.text('Sub-12 A vs Tigres'), findsOneWidget);
    expect(find.text('Sub-10 B vs Águilas'), findsOneWidget);
    expect(find.text('Pequeñas Ligas vs Leones'), findsNothing);
    expect(find.text('Sub-12 A · Entreno'), findsNothing);

    // Filtro por hijo.
    await tap(tester, find.widgetWithText(ChoiceChip, 'Beto'));
    expect(find.text('Sub-12 A vs Tigres'), findsNothing);
    expect(find.text('Sub-10 B vs Águilas'), findsOneWidget);
    await tap(tester, find.widgetWithText(ChoiceChip, 'Todos'));

    await tap(tester, find.widgetWithText(Tab, 'Entrenos'));
    expect(find.text('Sub-12 A · Entreno'), findsOneWidget);

    await tap(tester, find.widgetWithText(Tab, 'Estadísticas'));
    expect(find.text('Goles'), findsOneWidget);
    expect(find.text('200'), findsOneWidget);
    expect(
      find.text('Aún no hay partidos con ficha publicada en este deporte.'),
      findsOneWidget,
    );
  });
}
