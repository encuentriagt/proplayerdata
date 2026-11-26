import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/widgets/form_page.dart';
import '../../../core/widgets/proplayer_logo.dart';
import '../application/session_controller.dart';

/// El usuario entró pero no es padre ni encargado de ningún jugador.
class NotGuardianScreen extends ConsumerWidget {
  const NotGuardianScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return FormPage(
      children: [
        const Center(child: ProPlayerLogo(size: 56)),
        const SizedBox(height: 32),
        Text(
          'Esta App es para padres y encargados',
          style: Theme.of(context).textTheme.titleLarge
              ?.copyWith(fontWeight: FontWeight.w700),
        ),
        const SizedBox(height: 8),
        Text(
          'Esta App es para padres y encargados. El personal del colegio usa '
          'pc.ppdguate.com.',
          style: Theme.of(context).textTheme.bodyLarge,
        ),
        const SizedBox(height: 24),
        FilledButton(
          onPressed: () =>
              ref.read(sessionControllerProvider.notifier).logout(),
          child: const Text('Cerrar sesión'),
        ),
      ],
    );
  }
}
