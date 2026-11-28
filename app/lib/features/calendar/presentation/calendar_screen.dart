import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:material_ui/material_ui.dart';

import '../../../core/theme/brand_colors.dart';
import '../../../core/time/guatemala_time.dart';
import '../../../core/widgets/error_view.dart';
import '../../../core/widgets/home_actions.dart';
import '../../../core/widgets/v3.dart';
import '../../../core/widgets/message_banner.dart';
import '../../../core/widgets/sport_icon.dart';
import '../../children/application/children_providers.dart';
import '../../children/data/children_models.dart';
import '../../invitations/application/invitations_providers.dart';
import '../application/calendar_providers.dart';
import '../data/event_models.dart';
import 'event_tile.dart';
import 'month_grid.dart';

const limitText =
    'Esta función tiene un límite en su plan actual. Consulte con su '
    'institución.';

/// Hoy en Guatemala, sin hora.
DateTime todayGt() => GuatemalaTime.today();

/// Calendario de todos los hijos: solo lo que tienen convocado.
class CalendarScreen extends ConsumerStatefulWidget {
  const CalendarScreen({super.key});

  @override
  ConsumerState<CalendarScreen> createState() => _CalendarScreenState();
}

class _CalendarScreenState extends ConsumerState<CalendarScreen> {
  late DateTime _focused = todayGt();
  late DateTime _selected = todayGt();
  late final AppLifecycleListener _lifecycle;

  @override
  void initState() {
    super.initState();
    _lifecycle = AppLifecycleListener(onResume: _refresh);
  }

  @override
  void dispose() {
    _lifecycle.dispose();
    super.dispose();
  }

  Future<void> _refresh() async {
    final month = monthOf(_focused);
    ref.invalidate(calendarMonthProvider(month));
    refreshFamily(ref);
    await ref
        .read(calendarMonthProvider(month).future)
        .catchError((_) => const CalendarPage(events: []));
  }

  @override
  Widget build(BuildContext context) {
    final month = monthOf(_focused);
    final page = ref.watch(calendarMonthProvider(month));
    final filter = ref.watch(calendarFilterProvider);
    final children = ref.watch(childrenProvider).value ?? const <Child>[];

    final events = (page.value?.events ?? const <CalendarEvent>[])
        .where(filter.matches)
        .toList();
    List<CalendarEvent> onDay(DateTime day) => events.where((e) {
      final s = e.start;
      return s != null && sameDay(s, day);
    }).toList();
    final dayEvents = onDay(_selected);

    return Scaffold(
      body: SafeArea(
        bottom: false,
        child: RefreshIndicator(
          onRefresh: _refresh,
          child: ListView(
            padding: const EdgeInsets.only(bottom: 32),
            children: [
              const BigTitle('Calendario', trailing: HomeActions()),
              _Filters(children: children, filter: filter),
              Card(
                margin: const EdgeInsets.symmetric(horizontal: 12),
                child: MonthGrid(
                  month: month,
                  selected: _selected,
                  today: todayGt(),
                  markers: (day) => onDay(day).map(eventColor).toList(),
                  onSelect: (day) => setState(() => _selected = day),
                  onMonthChange: (delta) => setState(() {
                    _focused = DateTime(month.year, month.month + delta);
                    final today = todayGt();
                    _selected =
                        today.year == _focused.year &&
                            today.month == _focused.month
                        ? today
                        : _focused;
                  }),
                ),
              ),
              const SizedBox(height: 12),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 12),
                child: switch (page) {
                  AsyncError(:final error) when page.value == null => ErrorView(
                    error: error,
                    onRetry: () => ref.invalidate(calendarMonthProvider(month)),
                  ),
                  AsyncLoading() when page.value == null => const Padding(
                    padding: EdgeInsets.all(24),
                    child: Center(child: CircularProgressIndicator()),
                  ),
                  _ => _DayList(
                    day: _selected,
                    events: dayEvents,
                    historyLimited: page.value?.historyLimited ?? false,
                    noChildren: children.isEmpty,
                  ),
                },
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Filters extends ConsumerWidget {
  const _Filters({required this.children, required this.filter});

  final List<Child> children;
  final CalendarFilter filter;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final ctrl = ref.read(calendarFilterProvider.notifier);
    final kids = filter.childId == null
        ? children
        : children.where((c) => c.id == filter.childId).toList();
    final seen = <String>{};
    final sports = [
      for (final c in kids)
        for (final s in c.sports)
          if (seen.add(s.code)) s,
    ];

    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 12, 12, 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          SegmentedButton<EventTypeFilter>(
            segments: const [
              ButtonSegment(value: EventTypeFilter.all, label: Text('Todo')),
              ButtonSegment(
                value: EventTypeFilter.matches,
                label: Text('Partidos'),
              ),
              ButtonSegment(
                value: EventTypeFilter.trainings,
                label: Text('Entrenos'),
              ),
            ],
            selected: {filter.type},
            showSelectedIcon: false,
            onSelectionChanged: (s) => ctrl.setType(s.first),
          ),
          if (children.length > 1 || sports.length > 1) ...[
            const SizedBox(height: 8),
            SizedBox(
              height: 40,
              child: ListView(
                scrollDirection: Axis.horizontal,
                children: [
                  if (children.length > 1) ...[
                    _Choice(
                      label: 'Todos mis hijos',
                      selected: filter.childId == null,
                      onTap: () => ctrl.setChild(null),
                    ),
                    for (final c in children)
                      _Choice(
                        label: c.firstName,
                        selected: filter.childId == c.id,
                        onTap: () {
                          ctrl.setChild(c.id);
                          final code = filter.sportCode;
                          if (code != null &&
                              !c.sports.any((s) => s.code == code)) {
                            ctrl.setSport(null);
                          }
                        },
                      ),
                    const VerticalDivider(width: 16),
                  ],
                  if (sports.length > 1) ...[
                    _Choice(
                      label: 'Todos los deportes',
                      selected: filter.sportCode == null,
                      onTap: () => ctrl.setSport(null),
                    ),
                    for (final s in sports)
                      _Choice(
                        label: s.name,
                        icon: sportIcon(s.code),
                        selected: filter.sportCode == s.code,
                        onTap: () => ctrl.setSport(s.code),
                      ),
                  ],
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _Choice extends StatelessWidget {
  const _Choice({
    required this.label,
    required this.selected,
    required this.onTap,
    this.icon,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(right: 6),
      child: ChoiceChip(
        label: Text(label),
        avatar: icon == null ? null : Icon(icon, size: 18),
        selected: selected,
        showCheckmark: false,
        onSelected: (_) => onTap(),
      ),
    );
  }
}

class _DayList extends StatelessWidget {
  const _DayList({
    required this.day,
    required this.events,
    required this.historyLimited,
    required this.noChildren,
  });

  final DateTime day;
  final List<CalendarEvent> events;
  final bool historyLimited;
  final bool noChildren;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final title = GuatemalaTime.longDate(day);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (historyLimited) ...[
          const MessageBanner(limitText, kind: BannerKind.info),
          const SizedBox(height: 12),
        ],
        Text(
          '${title[0].toUpperCase()}${title.substring(1)}',
          style: text.titleMedium?.copyWith(fontWeight: FontWeight.w700),
        ),
        const SizedBox(height: 8),
        if (events.isEmpty)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 16),
            child: Text(
              noChildren
                  ? 'Cuando vincule a su hijo, aquí verá sus partidos y '
                        'entrenos.'
                  : 'No hay actividades este día.',
              style: text.bodyMedium?.copyWith(color: PpdColors.muted),
              textAlign: TextAlign.center,
            ),
          )
        else
          for (final e in events) EventTile(event: e),
      ],
    );
  }
}
