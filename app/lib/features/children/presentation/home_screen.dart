import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';

import '../../../core/theme/brand_colors.dart';
import '../../../core/theme/typography.dart';
import '../../../core/time/guatemala_time.dart';
import '../../../core/widgets/error_view.dart';
import '../../../core/widgets/home_actions.dart';
import '../../../core/widgets/org_crest.dart';
import '../../../core/widgets/sport_icon.dart';
import '../../auth/application/session_controller.dart';
import '../../invitations/application/invitations_providers.dart';
import '../../invitations/data/invitation_models.dart';
import '../application/children_providers.dart';
import '../data/children_models.dart';
import 'child_avatar.dart';

/// Pestaña Atletas: invitaciones pendientes y los hijos vinculados.
class HomeScreen extends ConsumerStatefulWidget {
  const HomeScreen({super.key});

  @override
  ConsumerState<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends ConsumerState<HomeScreen> {
  late final AppLifecycleListener _lifecycle;

  @override
  void initState() {
    super.initState();
    // Al volver a la App, refrescar.
    _lifecycle = AppLifecycleListener(onResume: () => refreshFamily(ref));
  }

  @override
  void dispose() {
    _lifecycle.dispose();
    super.dispose();
  }

  Future<void> _refresh() async {
    refreshFamily(ref);
    await Future.wait([
      ref.read(childrenProvider.future).catchError((_) => <Child>[]),
      ref.read(invitationsProvider.future).catchError((_) => <Invitation>[]),
    ]);
  }

  @override
  Widget build(BuildContext context) {
    final session = ref.watch(sessionControllerProvider);
    final profile = session is SignedIn ? session.profile : null;
    final children = ref.watch(childrenProvider);
    final pending = ref.watch(invitationsProvider).value?.length ?? 0;

    return Scaffold(
      body: SafeArea(
        bottom: false,
        child: RefreshIndicator(
          onRefresh: _refresh,
          child: ListView(
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 32),
            children: [
              Padding(
                padding: EdgeInsets.zero,
                child: Row(
                  children: [
                    const Expanded(child: _Title()),
                    const HomeActions(),
                  ],
                ),
              ),
              Align(
                alignment: Alignment.centerLeft,
                child: OutlinedButton(
                  onPressed: () => context.push('/codigo'),
                  child: const Text('Tengo un código'),
                ),
              ),
              const SizedBox(height: 16),
              if (pending > 0) ...[
                _InvitationsBanner(count: pending),
                const SizedBox(height: 16),
              ],
              switch (children) {
                AsyncData(:final value) when value.isEmpty => _NoChildren(
                  email: profile?.user.email ?? '',
                  hasInvitations: pending > 0,
                ),
                AsyncData(:final value) => _ChildrenList(children: value),
                AsyncError(:final error) => ErrorView(
                  error: error,
                  onRetry: () => ref.invalidate(childrenProvider),
                ),
                _ => const Padding(
                  padding: EdgeInsets.all(32),
                  child: Center(child: CircularProgressIndicator()),
                ),
              },
            ],
          ),
        ),
      ),
    );
  }
}

class _InvitationsBanner extends StatelessWidget {
  const _InvitationsBanner({required this.count});

  final int count;

  @override
  Widget build(BuildContext context) {
    final label = count == 1
        ? 'Tiene 1 invitación pendiente'
        : 'Tiene $count invitaciones pendientes';
    return Card(
      color: PpdColors.infoBg,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.all(Radius.circular(16)),
      ),
      child: ListTile(
        leading: const Icon(Icons.mail, color: PpdColors.infoInk),
        title: Text(
          label,
          style: const TextStyle(
            color: PpdColors.infoInk,
            fontWeight: FontWeight.w700,
          ),
        ),
        subtitle: const Text(
          'Acéptela para ver los datos de su hijo.',
          style: TextStyle(color: PpdColors.infoInk),
        ),
        trailing: const Icon(Icons.chevron_right, color: PpdColors.infoInk),
        onTap: () => context.push('/invitaciones'),
      ),
    );
  }
}

class _Title extends StatelessWidget {
  const _Title();

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(top: 16, bottom: 8),
    child: Semantics(
      header: true,
      child: Text('ATLETAS', style: PpdType.headline(56, color: PpdColors.ink)),
    ),
  );
}

class _ChildrenList extends StatelessWidget {
  const _ChildrenList({required this.children});

  final List<Child> children;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [for (final child in children) _ChildCard(child: child)],
    );
  }
}

/// Portada del atleta: color de su deporte, silueta, nombre y foto.
class _ChildCard extends StatelessWidget {
  const _ChildCard({required this.child});

  final Child child;

  @override
  Widget build(BuildContext context) {
    final team = child.teams.firstOrNull;
    final code = team?.sport.code ?? 'soccer';
    final p = sportPalette(code);
    final kicker = [
      if (team?.jerseyNumber != null) '#${team!.jerseyNumber}',
      ?team?.position?.name,
    ].join(' · ');
    final age = child.ageOn(GuatemalaTime.today());
    return Padding(
      padding: const EdgeInsets.only(bottom: 20),
      child: Semantics(
        button: true,
        label: child.fullName,
        child: InkWell(
          onTap: () => context.push('/hijos/${child.id}'),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Container(
                height: 172,
                clipBehavior: Clip.hardEdge,
                decoration: BoxDecoration(
                  gradient: RadialGradient(
                    center: const Alignment(.4, -.4),
                    radius: 1.1,
                    colors: [p.main, p.deep],
                  ),
                ),
                child: Stack(
                  children: [
                    Positioned(
                      right: 90,
                      top: -10,
                      child: Opacity(
                        opacity: .45,
                        child: SportSilhouette(
                          code: code,
                          color: Colors.white,
                          size: 190,
                          fade: true,
                          mirror: true,
                        ),
                      ),
                    ),
                    Positioned(
                      right: 16,
                      bottom: 16,
                      child: Container(
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          border: Border.all(color: Colors.white, width: 4),
                        ),
                        child: ChildAvatar(child: child, radius: 46),
                      ),
                    ),
                    Positioned(
                      left: 16,
                      right: 130,
                      bottom: 14,
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          if (kicker.isNotEmpty)
                            Text(
                              kicker.toUpperCase(),
                              style: PpdType.label(color: p.onMain),
                            ),
                          FittedBox(
                            fit: BoxFit.scaleDown,
                            alignment: Alignment.centerLeft,
                            child: Text(
                              child.fullName,
                              style: PpdType.headline(
                                44,
                                color: p.onMain,
                              ).copyWith(height: 1),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(vertical: 10),
                decoration: const BoxDecoration(
                  border: Border(bottom: BorderSide(color: PpdColors.ink)),
                ),
                child: Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  crossAxisAlignment: WrapCrossAlignment.center,
                  children: [
                    OrgCrest(url: child.organization.crestUrl, size: 18),
                    Text(
                      [
                        if (age != null) '$age años',
                        child.organization.name,
                      ].join(' · '),
                      style: const TextStyle(fontSize: 14),
                    ),
                    for (final s in child.sports)
                      SportChip(code: s.code, name: s.name),
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

class _NoChildren extends StatelessWidget {
  const _NoChildren({required this.email, required this.hasInvitations});

  final String email;
  final bool hasInvitations;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          children: [
            const Icon(Icons.family_restroom, size: 48, color: PpdColors.muted),
            const SizedBox(height: 12),
            Text(
              'Aún no tiene hijos vinculados',
              style: text.titleMedium?.copyWith(fontWeight: FontWeight.w700),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 8),
            Text(
              hasInvitations
                  ? 'Acepte la invitación del colegio para vincular a su hijo.'
                  : 'Cuando el colegio inscriba a su hijo con su correo '
                        '($email), le llegará una invitación. Si recibió un '
                        'código, ingréselo aquí.',
              style: text.bodyMedium,
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 16),
            FilledButton(
              onPressed: () =>
                  context.push(hasInvitations ? '/invitaciones' : '/codigo'),
              child: Text(
                hasInvitations ? 'Ver invitaciones' : 'Tengo un código',
              ),
            ),
          ],
        ),
      ),
    );
  }
}
