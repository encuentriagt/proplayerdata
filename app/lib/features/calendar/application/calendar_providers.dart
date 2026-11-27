import 'package:flutter_riverpod/flutter_riverpod.dart';

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

/// Detalle de un evento para un hijo.
final childEventProvider =
    FutureProvider.family<ChildEventDetail, ({int childId, int eventId})>(
      (ref, key) => ref
          .watch(calendarRepositoryProvider)
          .childEvent(key.childId, key.eventId),
    );
