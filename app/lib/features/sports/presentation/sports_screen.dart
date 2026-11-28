import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';

import '../../../core/theme/brand_colors.dart';
import '../../../core/theme/typography.dart';
import '../../../core/widgets/error_view.dart';
import '../../../core/widgets/home_actions.dart';
import '../../../core/widgets/sport_icon.dart';
import '../../../core/widgets/v3.dart';
import '../../children/application/children_providers.dart';
import '../../children/data/children_models.dart';
import '../application/sports_providers.dart';
import '../data/sport_models.dart';

/// Todos los deportes en que están los hijos, de todos los colegios.
class SportsScreen extends ConsumerWidget {
  const SportsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final sports = ref.watch(sportsProvider);
    final list = sports.value ?? const <SportSummary>[];
    final kids = {for (final s in list) ...s.children.map((c) => c.id)};
    final orgs = {
      for (final s in list) ...s.children.map((c) => c.organization.id),
    };
    String n(int v, String one, String many) => '$v ${v == 1 ? one : many}';
    return Scaffold(
      body: SafeArea(
        bottom: false,
        child: RefreshIndicator(
          onRefresh: () async {
            ref.invalidate(childrenProvider);
            await ref
                .read(childrenProvider.future)
                .catchError((_) => <Child>[]);
          },
          child: ListView(
            padding: const EdgeInsets.only(bottom: 32),
            children: switch (sports) {
              AsyncData(:final value) when value.isEmpty => [
                const BigTitle('Deportes', trailing: HomeActions()),
                const _Empty(),
              ],
              AsyncData(:final value) => [
                BigTitle(
                  'Deportes',
                  subtitle: [
                    n(value.length, 'deporte', 'deportes'),
                    n(kids.length, 'atleta', 'atletas'),
                    n(orgs.length, 'colegio', 'colegios'),
                  ].join(' · '),
                  trailing: const HomeActions(),
                ),
                for (final s in value) _SportCard(summary: s),
              ],
              AsyncError(:final error) => [
                ErrorView(
                  error: error,
                  onRetry: () => ref.invalidate(childrenProvider),
                ),
              ],
              _ => [
                const Padding(
                  padding: EdgeInsets.all(32),
                  child: Center(child: CircularProgressIndicator()),
                ),
              ],
            },
          ),
        ),
      ),
    );
  }
}

/// Bloque del deporte con su color, la silueta y quién lo juega.
class _SportCard extends StatelessWidget {
  const _SportCard({required this.summary});

  final SportSummary summary;

  @override
  Widget build(BuildContext context) {
    final sport = summary.sport;
    final p = sportPalette(sport.code);
    final who = [
      for (final e in summary.entries)
        [
          e.jerseyLabel,
          e.child.organization.name,
          e.team.name,
        ].where((x) => x.isNotEmpty).join(' · '),
    ].join('  /  ');
    return Semantics(
      button: true,
      label: '${sport.name}. $who',
      excludeSemantics: true,
      child: InkWell(
        onTap: () => context.push('/deportes/${sport.code}'),
        child: Container(
          constraints: const BoxConstraints(minHeight: 180),
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [p.main, p.deep],
            ),
          ),
          clipBehavior: Clip.hardEdge,
          child: Stack(
            children: [
              Positioned(
                right: 30,
                top: -6,
                bottom: -6,
                child: Opacity(
                  opacity: .38,
                  child: SportSilhouette(
                    code: sport.code,
                    color: p.onMain == PpdColors.ink
                        ? PpdColors.ink
                        : Colors.white,
                    size: 200,
                    fade: true,
                  ),
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 18, 84, 20),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      n(
                        summary.children.length,
                        'atleta',
                        'atletas',
                      ).toUpperCase(),
                      style: PpdType.label(
                        color: p.onMain == PpdColors.ink
                            ? const Color(0xFF3A2A10)
                            : PpdColors.gold,
                      ),
                    ),
                    const SizedBox(height: 6),
                    FittedBox(
                      fit: BoxFit.scaleDown,
                      alignment: Alignment.centerLeft,
                      child: Text(
                        sport.name.toUpperCase(),
                        style: PpdType.headline(64, color: p.onMain),
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      who,
                      style: TextStyle(
                        fontSize: 14,
                        color: p.onMain.withValues(alpha: .9),
                      ),
                    ),
                  ],
                ),
              ),
              Positioned(
                right: 20,
                bottom: 18,
                child: Container(
                  width: 48,
                  height: 48,
                  decoration: BoxDecoration(
                    color: p.onMain == PpdColors.ink
                        ? PpdColors.ink
                        : Colors.white,
                    shape: BoxShape.circle,
                  ),
                  child: Icon(
                    Icons.arrow_forward,
                    color: p.onMain == PpdColors.ink ? PpdColors.gold : p.text,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  static String n(int v, String one, String many) =>
      '$v ${v == 1 ? one : many}';
}

extension on SportEntry {
  /// «Ana #9».
  String get jerseyLabel => [
    child.firstName,
    if (team.jerseyNumber != null) '#${team.jerseyNumber}',
  ].join(' ');
}

class _Empty extends StatelessWidget {
  const _Empty();

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 32),
      child: Column(
        children: [
          const Icon(Icons.sports, size: 48, color: PpdColors.muted),
          const SizedBox(height: 12),
          Text(
            'Todavía no hay deportes',
            style: text.titleMedium?.copyWith(fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 8),
          Text(
            'Aquí aparecerán los deportes de sus hijos cuando estén '
            'vinculados y el colegio los agregue a un equipo.',
            textAlign: TextAlign.center,
            style: text.bodyMedium,
          ),
        ],
      ),
    );
  }
}
