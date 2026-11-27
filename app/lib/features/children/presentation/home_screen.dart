import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';

import '../../../core/theme/brand_colors.dart';
import '../../../core/widgets/error_view.dart';
import '../../../core/widgets/org_crest.dart';
import '../../../core/widgets/sport_icon.dart';
import '../../auth/application/session_controller.dart';
import '../../invitations/application/invitations_providers.dart';
import '../../invitations/data/invitation_models.dart';
import '../application/children_providers.dart';
import '../data/children_models.dart';
import 'child_avatar.dart';

/// Inicio: invitaciones pendientes y «Mis hijos».
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
    final firstName = (profile?.user.name ?? '').split(' ').first;
    final children = ref.watch(childrenProvider);
    final pending = ref.watch(invitationsProvider).value?.length ?? 0;
    final text = Theme.of(context).textTheme;

    return Scaffold(
      appBar: AppBar(
        title: const Text('ProPlayer Data'),
        actions: [
          IconButton(
            tooltip: 'Invitaciones',
            onPressed: () => context.push('/invitaciones'),
            icon: Badge(
              isLabelVisible: pending > 0,
              label: Text('$pending'),
              child: const Icon(Icons.mail_outline),
            ),
          ),
          PopupMenuButton<String>(
            tooltip: 'Opciones',
            onSelected: (value) {
              switch (value) {
                case 'code':
                  context.push('/codigo');
                case 'password':
                  context.push('/contrasena');
                case 'logout':
                  ref.read(sessionControllerProvider.notifier).logout();
              }
            },
            itemBuilder: (_) => const [
              PopupMenuItem(value: 'code', child: Text('Tengo un código')),
              PopupMenuItem(
                value: 'password',
                child: Text('Cambiar contraseña'),
              ),
              PopupMenuItem(value: 'logout', child: Text('Cerrar sesión')),
            ],
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _refresh,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 20, 16, 32),
          children: [
            Text(
              'Hola, $firstName',
              style: text.headlineSmall?.copyWith(fontWeight: FontWeight.w700),
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

class _ChildrenList extends StatelessWidget {
  const _ChildrenList({required this.children});

  final List<Child> children;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          'Mis hijos',
          style: Theme.of(context).textTheme.titleMedium
              ?.copyWith(fontWeight: FontWeight.w700),
        ),
        const SizedBox(height: 8),
        for (final child in children) _ChildCard(child: child),
      ],
    );
  }
}

class _ChildCard extends StatelessWidget {
  const _ChildCard({required this.child});

  final Child child;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: () => context.push('/hijos/${child.id}'),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              ChildAvatar(child: child),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      child.fullName,
                      style: text.titleMedium?.copyWith(
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Row(
                      children: [
                        OrgCrest(url: child.organization.crestUrl, size: 18),
                        const SizedBox(width: 6),
                        Expanded(
                          child: Text(
                            child.organization.name,
                            style: text.bodyMedium?.copyWith(
                              color: PpdColors.muted,
                            ),
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                      ],
                    ),
                    if (child.sports.isNotEmpty) ...[
                      const SizedBox(height: 8),
                      Wrap(
                        spacing: 6,
                        runSpacing: 6,
                        children: [
                          for (final s in child.sports)
                            SportChip(code: s.code, name: s.name),
                        ],
                      ),
                    ],
                  ],
                ),
              ),
              const Icon(Icons.chevron_right, color: PpdColors.muted),
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
