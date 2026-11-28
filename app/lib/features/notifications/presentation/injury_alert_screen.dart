import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';

import '../../../core/theme/brand_colors.dart';
import '../../../core/theme/typography.dart';
import '../../../core/time/guatemala_time.dart';
import '../../../core/widgets/slide_to_confirm.dart';
import '../../../core/widgets/sport_icon.dart';
import '../../children/application/children_providers.dart';
import '../../children/presentation/child_avatar.dart';
import '../application/notifications_providers.dart';
import '../data/notifications_repository.dart';

/// Modo alerta por lesión: pantalla completa en rojo. Solo se cierra
/// deslizando «Enterado» (así el padre confirma que lo vio).
///
/// La repetición cada minuto la hará la notificación del teléfono cuando el
/// backend envíe el aviso de lesión con prioridad alta (pendiente).
class InjuryAlertScreen extends ConsumerWidget {
  const InjuryAlertScreen({super.key, this.notification});

  final AppNotification? notification;

  Future<void> _acknowledge(WidgetRef ref, BuildContext context) async {
    final n = notification;
    if (n != null) {
      try {
        await ref.read(notificationsRepositoryProvider).markRead([n.id]);
        ref.invalidate(notificationsProvider);
      } catch (_) {
        // Si falla la red, igual se cierra: el aviso queda sin leer.
      }
    }
    await Future<void>.delayed(const Duration(milliseconds: 500));
    if (context.mounted) {
      context.canPop() ? context.pop() : context.go('/avisos');
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final n = notification;
    final name = n?.childName ?? 'Su hijo';
    final childId = n?.childIds.firstOrNull;
    final child = childId == null
        ? null
        : ref.watch(childProvider(childId)).value;
    final when = n?.createdAt == null
        ? null
        : GuatemalaTime.parse(n!.createdAt!);
    final rows = <(String, String)>[
      if (n?.organizationName != null) ('Colegio', n!.organizationName!),
      if (n?.data['team_name'] != null) ('Equipo', n!.data['team_name']!),
      if (when != null)
        (
          'Hora',
          '${GuatemalaTime.shortDate(when)} ${GuatemalaTime.time(when)}',
        ),
      if (n?.data['note'] != null) ('Nota del coach', n!.data['note']!),
    ];
    const soft = Color(0xFFFFD9D5);

    return PopScope(
      canPop: false,
      child: Scaffold(
        backgroundColor: PpdColors.error,
        body: Container(
          decoration: const BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [Color(0xFFC62F25), PpdColors.error, Color(0xFF7E1812)],
            ),
          ),
          child: SafeArea(
            child: Stack(
              children: [
                if (n?.sportCode != null)
                  Positioned(
                    right: -60,
                    top: 120,
                    child: Opacity(
                      opacity: .14,
                      child: SportSilhouette(
                        code: n!.sportCode!,
                        color: Colors.white,
                        size: 330,
                        fade: true,
                      ),
                    ),
                  ),
                Padding(
                  padding: const EdgeInsets.fromLTRB(24, 20, 24, 24),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Container(
                            width: 10,
                            height: 10,
                            decoration: const BoxDecoration(
                              color: Colors.white,
                              shape: BoxShape.circle,
                            ),
                          ),
                          const SizedBox(width: 8),
                          Text(
                            'ALERTA DE LESIÓN',
                            style: PpdType.label(color: soft),
                          ),
                        ],
                      ),
                      const Spacer(),
                      if (child != null)
                        Container(
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            border: Border.all(color: Colors.white, width: 4),
                          ),
                          child: ChildAvatar(child: child, radius: 52),
                        )
                      else
                        const CircleAvatar(
                          radius: 44,
                          backgroundColor: Colors.white,
                          child: Icon(
                            Icons.warning_amber_rounded,
                            color: PpdColors.error,
                            size: 48,
                          ),
                        ),
                      const SizedBox(height: 22),
                      Semantics(
                        header: true,
                        child: Text(
                          '$name se lesionó'.toUpperCase(),
                          style: PpdType.headline(72, color: Colors.white),
                        ),
                      ),
                      const SizedBox(height: 14),
                      Text(
                        n?.body ?? 'El coach registró una lesión.',
                        style: const TextStyle(
                          fontSize: 18,
                          height: 1.45,
                          color: Color(0xFFFFEDEA),
                        ),
                      ),
                      if (rows.isNotEmpty) ...[
                        const SizedBox(height: 18),
                        for (final (label, value) in rows)
                          Container(
                            padding: const EdgeInsets.symmetric(vertical: 10),
                            decoration: const BoxDecoration(
                              border: Border(
                                top: BorderSide(color: Color(0x38FFFFFF)),
                              ),
                            ),
                            child: Row(
                              children: [
                                Text(
                                  label,
                                  style: const TextStyle(
                                    color: soft,
                                    fontSize: 15,
                                  ),
                                ),
                                const SizedBox(width: 16),
                                Expanded(
                                  child: Text(
                                    value,
                                    textAlign: TextAlign.right,
                                    style: const TextStyle(
                                      color: Colors.white,
                                      fontSize: 15,
                                      fontWeight: FontWeight.w700,
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          ),
                      ],
                      const Spacer(),
                      SlideToConfirm(
                        label: 'Deslice para marcar enterado',
                        onConfirmed: () => _acknowledge(ref, context),
                      ),
                      const SizedBox(height: 10),
                      const Center(
                        child: Text(
                          'Mientras no lo confirme, el aviso se repite cada '
                          'minuto.',
                          style: TextStyle(color: soft, fontSize: 12),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
