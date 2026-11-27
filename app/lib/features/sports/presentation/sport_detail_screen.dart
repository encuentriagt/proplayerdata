import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:material_ui/material_ui.dart';

import '../../../core/network/api_exception.dart';
import '../../../core/theme/brand_colors.dart';
import '../../../core/widgets/error_view.dart';
import '../../../core/widgets/message_banner.dart';
import '../../../core/widgets/sport_icon.dart';
import '../../../core/widgets/stat_box.dart';
import '../../calendar/data/event_models.dart';
import '../../calendar/presentation/calendar_screen.dart' show limitText;
import '../../calendar/presentation/event_tile.dart';
import '../../children/data/children_models.dart';
import '../../children/presentation/child_avatar.dart';
import '../application/sports_providers.dart';
import '../data/sport_models.dart';

/// Un deporte: partidos, entrenos y estadísticas de los hijos que lo juegan.
class SportDetailScreen extends ConsumerStatefulWidget {
  const SportDetailScreen({super.key, required this.sportCode});

  final String sportCode;

  @override
  ConsumerState<SportDetailScreen> createState() => _SportDetailScreenState();
}

class _SportDetailScreenState extends ConsumerState<SportDetailScreen> {
  /// Hijo elegido (null = todos los hijos de este deporte).
  int? _childId;

  @override
  Widget build(BuildContext context) {
    final sports = ref.watch(sportsProvider);
    final summary = sports.value
        ?.where((s) => s.sport.code == widget.sportCode)
        .firstOrNull;

    if (summary == null) {
      return Scaffold(
        appBar: AppBar(title: const Text('Deporte')),
        body: Center(
          child: sports.isLoading
              ? const CircularProgressIndicator()
              : const Padding(
                  padding: EdgeInsets.all(24),
                  child: Text(
                    'Ninguno de sus hijos está en este deporte.',
                    textAlign: TextAlign.center,
                  ),
                ),
        ),
      );
    }

    final kids = summary.children;
    final shown = _childId == null
        ? kids
        : kids.where((c) => c.id == _childId).toList();

    return DefaultTabController(
      length: 3,
      child: Scaffold(
        appBar: AppBar(
          title: Row(
            children: [
              Icon(sportIcon(summary.sport.code)),
              const SizedBox(width: 8),
              Flexible(child: Text(summary.sport.name)),
            ],
          ),
          bottom: const TabBar(
            labelColor: PpdColors.onInk,
            unselectedLabelColor: Color(0xB3FFFFFF),
            indicatorColor: PpdColors.star,
            tabs: [
              Tab(text: 'Partidos'),
              Tab(text: 'Entrenos'),
              Tab(text: 'Estadísticas'),
            ],
          ),
        ),
        body: Column(
          children: [
            if (kids.length > 1)
              SizedBox(
                height: 52,
                child: ListView(
                  scrollDirection: Axis.horizontal,
                  padding: const EdgeInsets.fromLTRB(12, 8, 12, 4),
                  children: [
                    _Choice(
                      label: 'Todos',
                      selected: _childId == null,
                      onTap: () => setState(() => _childId = null),
                    ),
                    for (final c in kids)
                      _Choice(
                        label: c.firstName,
                        selected: _childId == c.id,
                        onTap: () => setState(() => _childId = c.id),
                      ),
                  ],
                ),
              ),
            Expanded(
              child: TabBarView(
                children: [
                  _EventsTab(
                    summary: summary,
                    childIds: {for (final c in shown) c.id},
                    matches: true,
                  ),
                  _EventsTab(
                    summary: summary,
                    childIds: {for (final c in shown) c.id},
                    matches: false,
                  ),
                  _StatsTab(summary: summary, children: shown),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Choice extends StatelessWidget {
  const _Choice({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(right: 6),
      child: ChoiceChip(
        label: Text(label),
        selected: selected,
        showCheckmark: false,
        onSelected: (_) => onTap(),
      ),
    );
  }
}

class _EventsTab extends ConsumerWidget {
  const _EventsTab({
    required this.summary,
    required this.childIds,
    required this.matches,
  });

  final SportSummary summary;
  final Set<int> childIds;

  /// true = partidos; false = entrenos.
  final bool matches;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final sportId = summary.sport.id;
    final page = ref.watch(sportEventsProvider(sportId));
    final text = Theme.of(context).textTheme;

    bool keep(CalendarEvent e) =>
        (matches ? e.isMatch : e.isTraining) &&
        (e.sport?.code ?? '') == summary.sport.code &&
        e.calledChildren.any((c) => childIds.contains(c.childId));

    final now = DateTime.now();
    final events = (page.value?.events ?? const <CalendarEvent>[])
        .where(keep)
        .toList();
    bool isPast(CalendarEvent e) {
      final s = e.startsAt == null ? null : DateTime.tryParse(e.startsAt!);
      return s != null && s.isBefore(now);
    }

    final upcoming = events.where((e) => !isPast(e)).toList();
    final recent = events.where(isPast).toList().reversed.toList();
    final noun = matches ? 'partidos' : 'entrenos';

    return RefreshIndicator(
      onRefresh: () async {
        ref.invalidate(sportEventsProvider(sportId));
        await ref
            .read(sportEventsProvider(sportId).future)
            .catchError((_) => const CalendarPage(events: []));
      },
      child: ListView(
        padding: const EdgeInsets.fromLTRB(12, 12, 12, 32),
        children: [
          if (page.value == null && page.hasError)
            ErrorView(
              error: page.error!,
              onRetry: () => ref.invalidate(sportEventsProvider(sportId)),
            )
          else if (page.value == null)
            const Padding(
              padding: EdgeInsets.all(32),
              child: Center(child: CircularProgressIndicator()),
            )
          else ...[
            if (page.value!.historyLimited) ...[
              const MessageBanner(limitText, kind: BannerKind.info),
              const SizedBox(height: 12),
            ],
            _Section(title: 'Próximos'),
            if (upcoming.isEmpty)
              _EmptyLine('No hay $noun próximos.')
            else
              for (final e in upcoming) EventTile(event: e, showDate: true),
            const SizedBox(height: 16),
            _Section(title: 'Recientes'),
            if (recent.isEmpty)
              _EmptyLine('No hay $noun en los últimos 60 días.')
            else
              for (final e in recent) EventTile(event: e, showDate: true),
          ],
          const SizedBox(height: 8),
          Text(
            'Se muestran las actividades donde su hijo está convocado.',
            style: text.bodySmall?.copyWith(color: PpdColors.muted),
            textAlign: TextAlign.center,
          ),
        ],
      ),
    );
  }
}

class _Section extends StatelessWidget {
  const _Section({required this.title});

  final String title;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 8),
    child: Text(
      title,
      style: Theme.of(context).textTheme.titleMedium
          ?.copyWith(fontWeight: FontWeight.w700),
    ),
  );
}

class _EmptyLine extends StatelessWidget {
  const _EmptyLine(this.text);

  final String text;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 8),
    child: Text(
      text,
      style: Theme.of(context).textTheme.bodyMedium
          ?.copyWith(color: PpdColors.muted),
    ),
  );
}

class _StatsTab extends StatelessWidget {
  const _StatsTab({required this.summary, required this.children});

  final SportSummary summary;
  final List<Child> children;

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(12, 12, 12, 32),
      children: [
        for (final c in children)
          _ChildStatsCard(
            child: c,
            sport: summary.sport,
            teams: summary.entries
                .where((e) => e.child.id == c.id)
                .map((e) => e.team.name)
                .toList(),
          ),
      ],
    );
  }
}

class _ChildStatsCard extends ConsumerWidget {
  const _ChildStatsCard({
    required this.child,
    required this.sport,
    required this.teams,
  });

  final Child child;
  final Sport sport;
  final List<String> teams;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final stats = ref.watch(childStatsProvider(child.id));
    final text = Theme.of(context).textTheme;
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                ChildAvatar(child: child, radius: 20),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        child.firstName,
                        style: text.titleMedium?.copyWith(
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      Text(
                        '${child.organization.name} · ${teams.join(', ')}',
                        style: text.bodySmall?.copyWith(color: PpdColors.muted),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            switch (stats) {
              AsyncData(:final value) => _StatsBody(
                stats: value.forSport(sport.id),
                limited: value.limited,
              ),
              AsyncError(:final error)
                  when error is ApiException && error.code == 'plan_limit' =>
                const MessageBanner(limitText, kind: BannerKind.info),
              AsyncError(:final error) => ErrorView(
                error: error,
                onRetry: () => ref.invalidate(childStatsProvider(child.id)),
              ),
              _ => const Center(child: CircularProgressIndicator()),
            },
          ],
        ),
      ),
    );
  }
}

class _StatsBody extends StatelessWidget {
  const _StatsBody({required this.stats, required this.limited});

  final SportStats? stats;
  final bool limited;

  @override
  Widget build(BuildContext context) {
    final s = stats;
    final text = Theme.of(context).textTheme;
    if (s == null || s.matches == 0) {
      return Text(
        'Aún no hay partidos con ficha publicada en este deporte.',
        style: text.bodyMedium?.copyWith(color: PpdColors.muted),
      );
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            StatBox(name: 'Partidos', value: s.matches),
            StatBox(name: 'Minutos', value: s.minutes),
            for (final st in s.stats) StatBox(name: st.name, value: st.value),
          ],
        ),
        if (limited) ...[
          const SizedBox(height: 12),
          const MessageBanner(limitText, kind: BannerKind.info),
        ],
      ],
    );
  }
}
