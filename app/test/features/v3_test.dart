import 'dart:convert';

import 'package:app/app.dart';
import 'package:app/features/calendar/data/event_models.dart';
import 'package:app/features/calendar/presentation/result_hero.dart';
import 'package:app/features/notifications/data/notifications_repository.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:material_ui/material_ui.dart';

import '../support/fake_api.dart';
import '../support/fake_google.dart';
import '../support/fake_links.dart';
import '../support/fake_photos.dart';
import 'calendar_test.dart' show todayAt;

Map<String, dynamic> _child() => {
  'id': 21,
  'first_name': 'Ana',
  'last_name': 'López',
  'organization': {'id': 1, 'name': 'Los Pinos'},
  'teams': [
    {
      'id': 3,
      'name': 'Sub-12',
      'jersey_number': 9,
      'sport': {'id': 1, 'code': 'soccer', 'name': 'Fútbol'},
    },
  ],
};

Map<String, dynamic> _match() => {
  'id': 100,
  'team_id': 3,
  'type': 'match',
  'display_title': 'Sub-12 vs Tigres',
  'starts_at': todayAt(23),
  'status': 'scheduled',
  'opponent_name': 'Tigres',
  'team': {'id': 3, 'name': 'Los Pinos'},
  'sport': {'id': 1, 'code': 'soccer', 'name': 'Fútbol'},
  'organization': {'id': 1, 'name': 'Los Pinos'},
  'children': [
    {
      'child_id': 21,
      'first_name': 'Ana',
      'callup': {'status': 'called', 'response': null},
    },
  ],
};

final _inbox = [
  {
    'id': 1,
    'kind': 'attendance',
    'title': 'Ana: lesión',
    'body': 'El coach registró una lesión.',
    'data': {
      'status': 'injured',
      'player_id': '21',
      'child_name': 'Ana',
      'organization_name': 'Los Pinos',
      'sport_code': 'soccer',
      'note': 'Golpe en el tobillo',
    },
    'read': false,
    'created_at': todayAt(10),
  },
  {
    'id': 2,
    'kind': 'callup',
    'title': 'Ana fue convocada',
    'body': 'Los Pinos vs Tigres',
    'data': {'event_id': '100', 'player_id': '21', 'child_name': 'Ana'},
    'read': true,
    'created_at': todayAt(9),
  },
];

FakeApi _api() => FakeApi((r) {
  switch ((r.method, r.path)) {
    case ('GET', 'auth/me'):
      return FakeResponse(200, {'data': profileJson()});
    case ('GET', 'app/children'):
      return FakeResponse(200, {
        'data': [_child()],
      });
    case ('GET', 'app/invitations'):
      return const FakeResponse(200, {'data': []});
    case ('GET', 'app/events'):
      return FakeResponse(200, {
        'data': [_match()],
        'meta': {},
      });
    case ('GET', 'me/notifications'):
      return FakeResponse(200, {
        'data': _inbox,
        'meta': {'unread': 1},
      });
    case ('POST', 'me/notifications/read'):
      return const FakeResponse(200, {'data': null});
    default:
      return const FakeResponse(200, {'data': []});
  }
});

Future<void> _pump(WidgetTester tester, FakeApi api) async {
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
}

void main() {
  setUpAll(() => initializeDateFormatting('es'));

  group('resultado del partido', () {
    CalendarEvent match(int us, int them) => CalendarEvent.fromJson({
      ..._match(),
      'score_us': us,
      'score_them': them,
    });

    test('gana, pierde o empata por goles', () {
      expect(outcomeOf(match(3, 1)), MatchOutcome.won);
      expect(outcomeOf(match(0, 2)), MatchOutcome.lost);
      expect(outcomeOf(match(1, 1)), MatchOutcome.draw);
    });
    test('si empataron, deciden los penales', () {
      expect(
        outcomeOf(match(1, 1), shootoutUs: 4, shootoutThem: 3),
        MatchOutcome.won,
      );
      expect(
        outcomeOf(match(1, 1), shootoutUs: 2, shootoutThem: 3),
        MatchOutcome.lost,
      );
    });
  });

  test('aviso de asistencia con lesión se trata como alerta', () {
    final n = AppNotification.fromJson(_inbox.first);
    expect(n.isInjury, isTrue);
    expect(n.childIds, [21]);
    expect(n.childName, 'Ana');
    final callup = AppNotification.fromJson(_inbox.last);
    expect(callup.isInjury, isFalse);
    expect(callup.eventId, 100);
  });

  testWidgets('inicio: próximo partido con marcador y atletas', (tester) async {
    await _pump(tester, _api());
    expect(find.text('Hola, Marta'), findsOneWidget);
    expect(find.text('HOY JUEGA'), findsOneWidget);
    expect(find.text('ANA.'), findsOneWidget);
    expect(find.text('VS'), findsOneWidget);
    expect(find.text('Tigres'), findsOneWidget);
    expect(find.text('MIS ATLETAS'), findsOneWidget);
  });

  testWidgets('avisos: la lesión abre la alerta y se confirma deslizando', (
    tester,
  ) async {
    final api = _api();
    await _pump(tester, api);
    await tester.tap(find.text('Avisos').first);
    await tester.pumpAndSettle();

    expect(find.text('ANA: LESIÓN'), findsOneWidget);
    expect(find.text('Ana fue convocada'), findsOneWidget);

    await tester.tap(find.text('ANA: LESIÓN'));
    await tester.pumpAndSettle();
    expect(find.text('ANA SE LESIONÓ'), findsOneWidget);
    expect(find.text('Golpe en el tobillo'), findsOneWidget);

    // Un toque no basta: hay que deslizar hasta el final.
    final knob = find.byIcon(Icons.arrow_forward).last;
    await tester.tap(knob);
    await tester.pumpAndSettle();
    expect(find.text('ANA SE LESIONÓ'), findsOneWidget);

    await tester.drag(knob, const Offset(900, 0));
    await tester.pumpAndSettle();
    // La alerta se cierra medio segundo después de confirmar.
    await tester.pump(const Duration(seconds: 1));
    await tester.pumpAndSettle();
    expect(find.text('ANA SE LESIONÓ'), findsNothing);
    expect(
      api.requests.any(
        (r) => r.method == 'POST' && r.path == 'me/notifications/read',
      ),
      isTrue,
    );
  });
}
