import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/time/guatemala_time.dart';
import '../../children/application/children_providers.dart';
import '../data/calendar_repository.dart';
import '../data/event_models.dart';

/// Primer día del mes (sin hora). Clave de cada consulta del calendario.
DateTime monthOf(DateTime d) => DateTime(d.year, d.month);

/// Eventos de un mes, de todos los hijos.
final calendarMonthProvider = FutureProvider.family<CalendarPage, DateTime>((
  ref,
  month,
) async {
  if (ref.watch(currentUserIdProvider) == null) {
    return const CalendarPage(events: []);
  }
  final from = DateTime(month.year, month.month);
  final to = DateTime(month.year, month.month + 1, 0);
  return ref.watch(calendarRepositoryProvider).calendar(from: from, to: to);
});

/// Tipo de evento para filtrar.
enum EventTypeFilter { all, matches, trainings }

/// Filtros del calendario (todo se filtra en el teléfono, sin recargar).
class CalendarFilter {
  const CalendarFilter({
    this.childId,
    this.sportCode,
    this.type = EventTypeFilter.all,
  });

  final int? childId;
  final String? sportCode;
  final EventTypeFilter type;

  CalendarFilter copyWith({
    int? Function()? childId,
    String? Function()? sportCode,
    EventTypeFilter? type,
  }) => CalendarFilter(
    childId: childId == null ? this.childId : childId(),
    sportCode: sportCode == null ? this.sportCode : sportCode(),
    type: type ?? this.type,
  );

  /// Solo eventos en que algún hijo (o el elegido) está convocado.
  bool matches(CalendarEvent e) {
    final called = e.calledChildren;
    if (called.isEmpty) return false;
    if (childId != null && !called.any((c) => c.childId == childId)) {
      return false;
    }
    if (sportCode != null && e.sport?.code != sportCode) return false;
    return switch (type) {
      EventTypeFilter.all => true,
      EventTypeFilter.matches => e.isMatch,
      EventTypeFilter.trainings => e.isTraining,
    };
  }
}

class CalendarFilterController extends Notifier<CalendarFilter> {
  @override
  CalendarFilter build() {
    ref.watch(currentUserIdProvider);
    return const CalendarFilter();
  }

  void setChild(int? id) => state = state.copyWith(childId: () => id);
  void setSport(String? code) => state = state.copyWith(sportCode: () => code);
  void setType(EventTypeFilter type) => state = state.copyWith(type: type);
}

final calendarFilterProvider =
    NotifierProvider<CalendarFilterController, CalendarFilter>(
      CalendarFilterController.new,
    );

/// Próximos eventos en que algún hijo está convocado (hoy y 30 días más),
/// del más cercano al más lejano. Incluye los de hoy que ya empezaron.
final upcomingEventsProvider = FutureProvider<List<CalendarEvent>>((ref) async {
  if (ref.watch(currentUserIdProvider) == null) return const [];
  final today = GuatemalaTime.today();
  final page = await ref
      .watch(calendarRepositoryProvider)
      .calendar(from: today, to: today.add(const Duration(days: 30)));
  // `start` es la hora de pared de Guatemala marcada como UTC.
  final dayStart = DateTime.utc(today.year, today.month, today.day);
  final list = page.events
      .where((e) => e.calledChildren.isNotEmpty && !e.isCancelled)
      .where((e) => e.start == null || !e.start!.isBefore(dayStart))
      .toList();
  list.sort((a, b) {
    final x = a.start, y = b.start;
    if (x == null || y == null) return x == null ? 1 : -1;
    return x.compareTo(y);
  });
  return list;
});

/// Detalle de un evento para un hijo.
final childEventProvider =
    FutureProvider.family<ChildEventDetail, ({int childId, int eventId})>(
      (ref, key) => ref
          .watch(calendarRepositoryProvider)
          .childEvent(key.childId, key.eventId),
    );
