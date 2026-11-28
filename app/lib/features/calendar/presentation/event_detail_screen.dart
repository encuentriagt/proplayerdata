import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:material_ui/material_ui.dart';

import '../../../core/network/api_exception.dart';
import '../../../core/theme/brand_colors.dart';
import '../../../core/time/guatemala_time.dart';
import '../../../core/widgets/error_view.dart';
import '../../../core/widgets/message_banner.dart';
import '../../../core/widgets/sport_icon.dart';
import '../../../core/widgets/stat_box.dart';
import '../../children/application/children_providers.dart';
import '../../children/data/children_models.dart';
import '../../children/presentation/child_avatar.dart';
import '../application/calendar_providers.dart';
import '../data/event_models.dart';
import 'calendar_screen.dart' show limitText;
import 'result_hero.dart';

/// Detalle de un evento: datos generales y, por cada hijo convocado,
/// convocatoria, asistencia, minutos y estadísticas.
class EventDetailScreen extends ConsumerWidget {
  const EventDetailScreen({
    super.key,
    required this.eventId,
    required this.childIds,
    this.preview,
  });

  final int eventId;
  final List<int> childIds;

  /// El evento tal como venía en el calendario (escudo, deporte, colegio).
  final CalendarEvent? preview;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final children = ref.watch(childrenProvider).value ?? const <Child>[];
    final firstDetail = childIds.isEmpty
        ? null
        : ref.watch(
            childEventProvider((childId: childIds.first, eventId: eventId)),
          );
    final event = preview ?? firstDetail?.value?.event;
    final detail = firstDetail?.value;
    final showHero = event != null && event.isMatch && event.hasResult;

    return Scaffold(
      appBar: AppBar(title: Text(event?.typeLabel ?? 'Actividad')),
      body: RefreshIndicator(
        onRefresh: () async {
          for (final id in childIds) {
            ref.invalidate(childEventProvider((childId: id, eventId: eventId)));
          }
        },
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 32),
          children: [
            if (showHero)
              Padding(
                padding: const EdgeInsets.only(bottom: 16),
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(16),
                  child: ResultHero(
                    event: event,
                    shootoutUs: detail?.shootoutUs,
                    shootoutThem: detail?.shootoutThem,
                  ),
                ),
              )
            else
              const SizedBox(height: 16),
            if (event != null)
              _Header(event: event, children: children, showScore: !showHero)
            else if (firstDetail is AsyncError)
              ErrorView(
                error: firstDetail!.error!,
                onRetry: () => ref.invalidate(
                  childEventProvider((
                    childId: childIds.first,
                    eventId: eventId,
                  )),
                ),
              )
            else
              const Padding(
                padding: EdgeInsets.all(32),
                child: Center(child: CircularProgressIndicator()),
              ),
            const SizedBox(height: 16),
            for (final id in childIds)
              _ChildSection(
                eventId: eventId,
                childId: id,
                child: children.where((c) => c.id == id).firstOrNull,
              ),
          ],
        ),
      ),
    );
  }
}

class _Header extends StatelessWidget {
  const _Header({
    required this.event,
    required this.children,
    this.showScore = true,
  });

  final CalendarEvent event;
  final List<Child> children;

  /// Falso cuando el resultado ya se muestra en grande arriba.
  final bool showScore;

  @override
  Widget build(BuildContext context) {
    final e = event;
    final text = Theme.of(context).textTheme;
    final start = e.start;
    // Deporte y colegio: del calendario o, si no vienen, del hijo.
    ChildTeam? team;
    Child? owner;
    for (final c in children) {
      for (final t in c.teams) {
        if (t.id == e.teamId) {
          team = t;
          owner = c;
        }
      }
    }
    final sportName = e.sport?.name ?? team?.sport.name;
    final sportCode = e.sport?.code ?? team?.sport.code ?? '';
    final orgName = e.organization?.name ?? owner?.organization.name;
    final teamName = e.team?.name ?? e.teamName ?? team?.name;
    final day = start == null ? null : GuatemalaTime.longDate(start);

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                SportBadge(code: sportCode, size: 32),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    [
                      orgName,
                      sportName,
                      teamName,
                    ].whereType<String>().join(' · '),
                    style: text.bodySmall?.copyWith(color: PpdColors.muted),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Text(
              e.heading,
              style: text.headlineSmall?.copyWith(
                fontWeight: FontWeight.w700,
                decoration: e.isCancelled ? TextDecoration.lineThrough : null,
              ),
            ),
            if (e.isCancelled) ...[
              const SizedBox(height: 8),
              const MessageBanner('Esta actividad se canceló.'),
            ],
            if (e.hasResult && showScore) ...[
              const SizedBox(height: 12),
              _Score(event: e, teamName: teamName),
            ] else if (e.isMatch && !e.isCancelled && !e.hasResult) ...[
              const SizedBox(height: 8),
              Text(
                'El resultado aparece cuando el coach publica la ficha.',
                style: text.bodySmall?.copyWith(color: PpdColors.muted),
              ),
            ],
            const SizedBox(height: 12),
            if (day != null)
              _InfoRow(
                icon: Icons.event,
                text:
                    '${day[0].toUpperCase()}${day.substring(1)}, '
                    '${GuatemalaTime.time(start!)}',
              ),
            if (e.location != null && e.location!.isNotEmpty)
              _InfoRow(icon: Icons.place_outlined, text: e.location!),
            if (e.homeAwayLabel != null)
              _InfoRow(icon: Icons.stadium_outlined, text: e.homeAwayLabel!),
          ],
        ),
      ),
    );
  }
}

class _Score extends StatelessWidget {
  const _Score({required this.event, required this.teamName});

  final CalendarEvent event;
  final String? teamName;

  @override
  Widget build(BuildContext context) {
    final style = Theme.of(context).textTheme.headlineMedium
        ?.copyWith(fontWeight: FontWeight.w800);
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 16),
      decoration: BoxDecoration(
        color: PpdColors.paper,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        children: [
          Expanded(
            child: Text(
              teamName ?? 'Nosotros',
              textAlign: TextAlign.right,
              maxLines: 2,
            ),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12),
            child: Text('${event.scoreUs} – ${event.scoreThem}', style: style),
          ),
          Expanded(child: Text(event.opponentName ?? 'Rival', maxLines: 2)),
        ],
      ),
    );
  }
}

class _InfoRow extends StatelessWidget {
  const _InfoRow({required this.icon, required this.text});

  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 18, color: PpdColors.muted),
          const SizedBox(width: 8),
          Expanded(child: Text(text)),
        ],
      ),
    );
  }
}

class _ChildSection extends ConsumerWidget {
  const _ChildSection({
    required this.eventId,
    required this.childId,
    required this.child,
  });

  final int eventId;
  final int childId;
  final Child? child;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final detail = ref.watch(
      childEventProvider((childId: childId, eventId: eventId)),
    );
    final text = Theme.of(context).textTheme;
    final c = child;

    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                if (c != null) ChildAvatar(child: c, radius: 20),
                const SizedBox(width: 12),
                Text(
                  c?.firstName ?? 'Su hijo',
                  style: text.titleMedium?.copyWith(
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            switch (detail) {
              AsyncData(:final value) => _ChildData(detail: value),
              AsyncError(:final error)
                  when error is ApiException && error.code == 'plan_limit' =>
                const MessageBanner(limitText, kind: BannerKind.info),
              AsyncError(:final error) => ErrorView(
                error: error,
                onRetry: () => ref.invalidate(
                  childEventProvider((childId: childId, eventId: eventId)),
                ),
              ),
              _ => const Center(child: CircularProgressIndicator()),
            },
          ],
        ),
      ),
    );
  }
}

class _ChildData extends StatelessWidget {
  const _ChildData({required this.detail});

  final ChildEventDetail detail;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final d = detail;
    final rows = <Widget>[
      _Field(
        label: 'Convocatoria',
        value: d.callup == null
            ? 'No convocado'
            : '${d.callup!.statusLabel} · ${d.callup!.responseLabel}',
      ),
      if (d.attendance != null)
        _Field(
          label: 'Asistencia',
          value: d.attendance!.label,
          alert: d.attendance!.isInjury,
          note: d.attendance!.note,
        ),
      if (d.hasShootout)
        _Field(
          label: 'Penales',
          value: [
            'Tanda ${d.shootoutUs} – ${d.shootoutThem}',
            if (d.childShotsTaken != null && d.childShotsTaken! > 0)
              '${d.childShotsTaken == 1 ? 'Cobró 1' : 'Cobró ${d.childShotsTaken}'}, '
                  'anotó ${d.childShotsScored ?? 0}',
          ].join(' · '),
        ),
      if (d.played != null)
        _Field(
          label: 'Participación',
          value: [
            d.played!.isStarter ? 'Titular' : 'Suplente',
            if (d.played!.minutesPlayed != null)
              '${d.played!.minutesPlayed} minutos',
          ].join(' · '),
        ),
    ];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        ...rows,
        if (d.stats != null && d.stats!.isNotEmpty) ...[
          const SizedBox(height: 8),
          Text(
            'Estadísticas',
            style: text.titleSmall?.copyWith(fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final s in d.stats!) StatBox(name: s.name, value: s.value),
            ],
          ),
        ] else if (d.event.isMatch && d.stats == null && !d.event.isCancelled)
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Text(
              'Las estadísticas aparecen cuando el coach publica la ficha.',
              style: text.bodySmall?.copyWith(color: PpdColors.muted),
            ),
          ),
      ],
    );
  }
}

class _Field extends StatelessWidget {
  const _Field({
    required this.label,
    required this.value,
    this.alert = false,
    this.note,
  });

  final String label;
  final String value;
  final bool alert;
  final String? note;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: text.labelMedium?.copyWith(color: PpdColors.muted),
          ),
          Row(
            children: [
              if (alert) ...[
                const Icon(Icons.healing, size: 18, color: PpdColors.error),
                const SizedBox(width: 4),
              ],
              Expanded(
                child: Text(
                  value,
                  style: text.bodyLarge?.copyWith(
                    fontWeight: FontWeight.w600,
                    color: alert ? PpdColors.error : null,
                  ),
                ),
              ),
            ],
          ),
          if (note != null && note!.isNotEmpty)
            Text(note!, style: text.bodySmall),
        ],
      ),
    );
  }
}
