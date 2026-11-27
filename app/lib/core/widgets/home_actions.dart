import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';

import '../../features/auth/application/session_controller.dart';
import '../../features/invitations/application/invitations_providers.dart';

/// Acciones de la barra en las pestañas principales: invitaciones y menú.
class HomeActions extends ConsumerWidget {
  const HomeActions({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final pending = ref.watch(invitationsProvider).value?.length ?? 0;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
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
            PopupMenuItem(value: 'password', child: Text('Cambiar contraseña')),
            PopupMenuItem(value: 'logout', child: Text('Cerrar sesión')),
          ],
        ),
      ],
    );
  }
}
