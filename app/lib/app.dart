import 'package:material_ui/material_ui.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'core/theme/app_theme.dart';
import 'features/invitations/application/link_invitation.dart';
import 'router.dart';

/// Para mostrar avisos desde fuera de una pantalla (p. ej. al vincular).
final scaffoldMessengerKey = GlobalKey<ScaffoldMessengerState>();

class PpdApp extends ConsumerWidget {
  const PpdApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final router = ref.watch(routerProvider);
    // Enlace de vinculación: muestra el resultado y abre la ficha del hijo.
    ref.listen(linkInvitationProvider, (prev, next) {
      final outcome = next.outcome;
      if (outcome == null || outcome.seq == prev?.outcome?.seq) return;
      scaffoldMessengerKey.currentState?.showSnackBar(
        SnackBar(content: Text(outcome.message)),
      );
      if (outcome.childId != null) router.go('/hijos/${outcome.childId}');
    });
    return MaterialApp.router(
      scaffoldMessengerKey: scaffoldMessengerKey,
      title: 'ProPlayer Data',
      debugShowCheckedModeBanner: false,
      theme: buildTheme(),
      routerConfig: router,
      locale: const Locale('es', 'GT'),
      supportedLocales: const [Locale('es', 'GT'), Locale('es')],
      localizationsDelegates: GlobalMaterialLocalizations.delegates,
    );
  }
}
