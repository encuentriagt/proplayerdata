import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../calendar/data/calendar_repository.dart';
import '../../calendar/data/event_models.dart';
import '../../../core/time/guatemala_time.dart';
import '../../children/application/children_providers.dart';
import '../data/sport_models.dart';
import '../data/stats_repository.dart';

/// Todos los deportes de todos los hijos.
final sportsProvider = Provider<AsyncValue<List<SportSummary>>>(
  (ref) => ref.watch(childrenProvider).whenData(buildSportSummaries),
);

/// Actividades de un deporte: 60 días atrás y 59 adelante (máx. 120 de la API).
final sportEventsProvider = FutureProvider.family<CalendarPage, int?>((
  ref,
  sportId,
) async {
  if (ref.watch(currentUserIdProvider) == null) {
    return const CalendarPage(events: []);
  }
  final today = GuatemalaTime.today();
  return ref
      .watch(calendarRepositoryProvider)
      .calendar(
        from: today.subtract(const Duration(days: 60)),
        to: today.add(const Duration(days: 59)),
        sportId: sportId,
      );
});

/// Totales de un hijo (todos sus deportes).
final childStatsProvider = FutureProvider.family<ChildStats, int>(
  (ref, childId) => ref.watch(statsRepositoryProvider).childStats(childId),
);
