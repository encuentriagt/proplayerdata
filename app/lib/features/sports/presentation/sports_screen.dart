import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';

import '../../../core/theme/brand_colors.dart';
import '../../../core/widgets/error_view.dart';
import '../../../core/widgets/home_actions.dart';
import '../../../core/widgets/org_crest.dart';
import '../../../core/widgets/sport_icon.dart';
import '../../children/application/children_providers.dart';
import '../../children/data/children_models.dart';
import '../../children/presentation/child_avatar.dart';
import '../application/sports_providers.dart';
import '../data/sport_models.dart';

/// Todos los deportes en que están los hijos, de todos los colegios.
class SportsScreen extends ConsumerWidget {
  const SportsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final sports = ref.watch(sportsProvider);
    return Scaffold(
      appBar: AppBar(
        title: const Text('Deportes'),
        actions: const [HomeActions()],
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(childrenProvider);
          await ref.read(childrenProvider.future).catchError((_) => <Child>[]);
        },
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
          children: switch (sports) {
            AsyncData(:final value) when value.isEmpty => [const _Empty()],
            AsyncData(:final value) => [
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
    );
  }
}

class _SportCard extends StatelessWidget {
  const _SportCard({required this.summary});

  final SportSummary summary;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final sport = summary.sport;
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: () => context.push('/deportes/${sport.code}'),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  CircleAvatar(
                    radius: 24,
                    backgroundColor: PpdColors.ink,
                    foregroundColor: PpdColors.onInk,
                    child: Icon(sportIcon(sport.code), size: 28),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Text(
                      sport.name,
                      style: text.titleLarge?.copyWith(
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                  const Icon(Icons.chevron_right, color: PpdColors.muted),
                ],
              ),
              const SizedBox(height: 12),
              for (final e in summary.entries)
                Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: Row(
                    children: [
                      ChildAvatar(child: e.child, radius: 16),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              e.child.firstName,
                              style: text.bodyLarge?.copyWith(
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                            Row(
                              children: [
                                OrgCrest(
                                  url: e.child.organization.crestUrl,
                                  size: 14,
                                ),
                                const SizedBox(width: 4),
                                Expanded(
                                  child: Text(
                                    '${e.child.organization.name} · '
                                    '${e.team.name}',
                                    style: text.bodySmall?.copyWith(
                                      color: PpdColors.muted,
                                    ),
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                ),
                              ],
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
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
