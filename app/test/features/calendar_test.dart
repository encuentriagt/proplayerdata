import 'dart:convert';

import 'package:app/app.dart';
import 'package:app/features/calendar/application/calendar_providers.dart';
import 'package:app/features/calendar/data/event_models.dart';
import 'package:app/features/calendar/presentation/calendar_screen.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:material_ui/material_ui.dart';

import '../support/fake_api.dart';
import '../support/fake_google.dart';
import '../support/fake_photos.dart';

/// Hoy a una hora dada, en ISO con la zona de Guatemala.
String todayAt(int hour) {
  final d = todayGt();
  String two(int n) => n.toString().padLeft(2, '0');
  return '${d.year}-${two(d.month)}-${two(d.day)}T${two(hour)}:00:00-06:00';
}

Map<String, dynamic> kid(int id, String name, String org, List<Map> teams) => {
  'id': id,
  'first_name': name,
  'last_name': 'López',
  'organization': {'id': id, 'name': org},
  'teams': teams,
};

Map<String, dynamic> team(int id, String name, String code, String sport) => {
  'id': id,
  'name': name,
  'sport': {'id': id, 'code': code, 'name': sport},
};

Map<String, dynamic> event({
  required int id,
  required String type,
  required String title,
  required int hour,
  required Map<String, dynamic> team,
  required String org,
  required List<Map<String, dynamic>> children,
  int? scoreUs,
  int? scoreThem,
}) => {
  'id': id,
  'team_id': team['id'],
  'team_name': team['name'],
  'type': type,
  'display_title': title,
  'starts_at': todayAt(hour),
  'status': 'scheduled',
  'score_us': scoreUs,
  'score_them': scoreThem,
  'team': {'id': team['id'], 'name': team['name']},
  'sport': team['sport'],
  'organization': {'id': 1, 'name': org},
  'child_ids': [for (final c in children) c['child_id']],
  'children': children,
};

Map<String, dynamic> called(int id, String name) => {
  'child_id': id,
  'first_name': name,
  'callup': {'status': 'called', 'response': null},
};

Map<String, dynamic> notCalled(int id, String name) => {
  'child_id': id,
  'first_name': name,
  'callup': null,
};

final futbolA = team(3, 'Sub-12', 'soccer', 'Soccer');
final basketA = team(8, 'Mini Basket', 'basketball', 'Basketball');
final voleiB = team(9, 'Juvenil', 'volleyball', 'Volleyball');

final apiChildren = [
  kid(15, 'Ana', 'Colegio A', [futbolA, basketA]),
  kid(22, 'Luis', 'Colegio B', [voleiB, futbolA]),
];

final apiEvents = [
  // Partido con los dos hijos: viene una sola vez.
  event(
    id: 100,
    type: 'match',
    title: 'Sub-12 vs Tigres',
    hour: 9,
    team: futbolA,
    org: 'Colegio A',
    children: [called(15, 'Ana'), called(22, 'Luis')],
    scoreUs: 2,
    scoreThem: 1,
  ),
  event(
    id: 101,
    type: 'training',
    title: 'Mini Basket · Entreno',
    hour: 15,
    team: basketA,
    org: 'Colegio A',
    children: [called(15, 'Ana')],
  ),
  event(
    id: 102,
    type: 'training',
    title: 'Juvenil · Entreno',
    hour: 17,
    team: voleiB,
    org: 'Colegio B',
    children: [called(22, 'Luis')],
  ),
  // Nadie convocado: no se muestra.
  event(
    id: 103,
    type: 'match',
    title: 'Mini Basket vs Halcones',
    hour: 19,
    team: basketA,
    org: 'Colegio A',
    children: [notCalled(15, 'Ana')],
  ),
];

FakeApi calendarApi() => FakeApi((r) {
  switch (r.path) {
    case 'auth/me':
      return FakeResponse(200, {'data': profileJson()});
    case 'app/children':
      return FakeResponse(200, {'data': apiChildren});
    case 'app/invitations':
      return const FakeResponse(200, {'data': []});
    case 'app/events':
      return FakeResponse(200, {
        'data': apiEvents,
        'meta': {'history_limited': false},
      });
    case 'app/children/15/events/100':
      return FakeResponse(200, {
        'data': {
          ...apiEvents.first,
          'callup': {'status': 'called', 'response': 'confirmed'},
          'attendance': {'status': 'present', 'note': null},
          'child_played': {'is_starter': true, 'minutes_played': 60},
          'child_stats': [
            {'code': 'goal', 'name': 'Goles', 'value': 2},
            {'code': 'assist', 'name': 'Asistencias', 'value': 1},
          ],
        },
      });
    case 'app/children/22/events/100':
      return FakeResponse(200, {
        'data': {
          ...apiEvents.first,
          'callup': {'status': 'reserve', 'response': null},
          'attendance': {'status': 'injured', 'note': 'Tobillo'},
          'child_played': null,
          'child_stats': null,
        },
      });
  }
  return const FakeResponse(404);
});

Future<void> pumpCalendar(WidgetTester tester, FakeApi api) async {
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
        api.providerOverride,
        FakeGoogleAuth(isAvailable: false).providerOverride,
        FakePhotoStore().providerOverride,
      ],
      child: const PpdApp(),
    ),
  );
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

  group('CalendarFilter', () {
    final events = apiEvents.map(CalendarEvent.fromJson).toList();
    List<int> ids(CalendarFilter f) =>
        events.where(f.matches).map((e) => e.id).toList();

    test('solo lo que tiene convocado algún hijo', () {
      expect(ids(const CalendarFilter()), [100, 101, 102]);
    });
    test('por hijo', () {
      expect(ids(const CalendarFilter(childId: 22)), [100, 102]);
    });
    test('por deporte', () {
      expect(ids(const CalendarFilter(sportCode: 'basketball')), [101]);
    });
    test('partidos o entrenos', () {
      expect(ids(const CalendarFilter(type: EventTypeFilter.matches)), [100]);
      expect(ids(const CalendarFilter(type: EventTypeFilter.trainings)), [
        101,
        102,
      ]);
    });
  });

  testWidgets('calendario de todos los hijos y filtros', (tester) async {
    await pumpCalendar(tester, calendarApi());

    expect(find.text('Sub-12 vs Tigres'), findsOneWidget);
    expect(find.text('Ana, Luis'), findsOneWidget); // un solo evento, 2 hijos
    expect(find.text('Resultado: 2 – 1'), findsOneWidget);
    expect(find.text('Mini Basket · Entreno'), findsOneWidget);
    expect(find.text('Juvenil · Entreno'), findsOneWidget);
    expect(find.text('Mini Basket vs Halcones'), findsNothing);

    await tap(tester, find.text('Partidos'));
    expect(find.text('Sub-12 vs Tigres'), findsOneWidget);
    expect(find.text('Juvenil · Entreno'), findsNothing);

    await tap(tester, find.text('Todo'));
    await tap(tester, find.widgetWithText(ChoiceChip, 'Luis'));
    expect(find.text('Mini Basket · Entreno'), findsNothing);
    expect(find.text('Juvenil · Entreno'), findsOneWidget);

    await tap(tester, find.widgetWithText(ChoiceChip, 'Volleyball'));
    expect(find.text('Sub-12 vs Tigres'), findsNothing);
    expect(find.text('Juvenil · Entreno'), findsOneWidget);
  });

  testWidgets('detalle: datos de cada hijo, lesión y estadísticas', (
    tester,
  ) async {
    await pumpCalendar(tester, calendarApi());
    await tap(tester, find.text('Sub-12 vs Tigres'));

    expect(find.text('Colegio A · Soccer · Sub-12'), findsOneWidget);
    expect(find.text('2 – 1'), findsOneWidget);
    // Ana
    expect(find.text('Convocado · Asistencia confirmada'), findsOneWidget);
    expect(find.text('Titular · 60 minutos'), findsOneWidget);
    expect(find.text('Goles'), findsOneWidget);
    // Luis
    await tester.scrollUntilVisible(
      find.text('Lesión'),
      200,
      scrollable: find.byType(Scrollable).last,
    );
    expect(find.text('Reserva · Sin respuesta'), findsOneWidget);
    expect(find.text('Lesión'), findsOneWidget);
    expect(find.text('Tobillo'), findsOneWidget);
  });

  testWidgets('fuera del plan muestra el texto del límite', (tester) async {
    final api = calendarApi();
    final base = api.handler;
    api.handler = (r) => r.path == 'app/children/22/events/100'
        ? FakeResponse(403, apiError('plan_limit', 'Límite del plan.'))
        : base(r);
    await pumpCalendar(tester, api);
    await tap(tester, find.text('Sub-12 vs Tigres'));
    await tester.scrollUntilVisible(
      find.text(limitText),
      200,
      scrollable: find.byType(Scrollable).last,
    );
    expect(find.text(limitText), findsOneWidget);
  });
}
