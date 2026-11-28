import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';

import '../../../core/network/api_exception.dart';
import '../../../core/theme/brand_colors.dart';
import '../../../core/theme/typography.dart';
import '../../../core/widgets/error_view.dart';
import '../../../core/widgets/sport_icon.dart';
import '../../../core/widgets/v3.dart';
import '../application/notifications_providers.dart';
import '../data/notifications_repository.dart';

/// Pestaña Avisos: bandeja de todos los hijos y colegios.
class NotificationsScreen extends ConsumerWidget {
  const NotificationsScreen({super.key});

  Future<void> _markAll(WidgetRef ref, BuildContext context) async {
    try {
      await ref.read(notificationsRepositoryProvider).markRead();
      ref.invalidate(notificationsProvider);
    } on ApiException catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(e.message)));
      }
    }
  }

  Future<void> _open(
    WidgetRef ref,
    BuildContext context,
    AppNotification n,
  ) async {
    if (!n.read) {
      // Marcar leído no debe impedir abrir el aviso.
      ref
          .read(notificationsRepositoryProvider)
          .markRead([n.id])
          .then((_) => ref.invalidate(notificationsProvider))
          .catchError((_) {});
    }
    if (n.isInjury) {
      context.push('/alerta', extra: n);
    } else if (n.kind == 'link_invitation') {
      context.push('/invitaciones');
    } else if (n.eventId != null) {
      final ids = n.childIds.join(',');
      context.push('/eventos/${n.eventId}${ids.isEmpty ? '' : '?hijos=$ids'}');
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final inbox = ref.watch(notificationsProvider);
    final unread = ref.watch(unreadNotificationsProvider);
    return Scaffold(
      body: SafeArea(
        bottom: false,
        child: RefreshIndicator(
          onRefresh: () => ref.refresh(notificationsProvider.future),
          child: ListView(
            padding: const EdgeInsets.only(bottom: 24),
            children: [
              BigTitle(
                'Avisos',
                trailing: unread > 0
                    ? TextButton(
                        onPressed: () => _markAll(ref, context),
                        child: const Text(
                          'Marcar todo leído',
                          style: TextStyle(
                            decoration: TextDecoration.underline,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      )
                    : null,
              ),
              ...switch (inbox) {
                AsyncData(:final value) when value.items.isEmpty => [
                  const _Empty(),
                ],
                AsyncData(:final value) => [
                  for (final n in value.items)
                    _NotificationTile(
                      notification: n,
                      onTap: () => _open(ref, context, n),
                    ),
                  const Divider(height: 1),
                ],
                AsyncError(:final error) => [
                  Padding(
                    padding: const EdgeInsets.all(16),
                    child: ErrorView(
                      error: error,
                      onRetry: () => ref.invalidate(notificationsProvider),
                    ),
                  ),
                ],
                _ => [
                  const Padding(
                    padding: EdgeInsets.all(32),
                    child: Center(child: CircularProgressIndicator()),
                  ),
                ],
              },
            ],
          ),
        ),
      ),
    );
  }
}

class _NotificationTile extends StatelessWidget {
  const _NotificationTile({required this.notification, required this.onTap});

  final AppNotification notification;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final n = notification;
    final injury = n.isInjury;
    final cancelled = n.kind == 'event_cancelled';
    final meta = [
      ?n.organizationName,
      ?n.childName,
      relativeTime(n.createdAt),
    ].where((s) => s.isNotEmpty).join(' · ');
    final fg = injury ? PpdColors.onInk : PpdColors.ink;

    return Material(
      color: injury ? PpdColors.error : PpdColors.surface,
      child: InkWell(
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.fromLTRB(20, 14, 20, 14),
          decoration: const BoxDecoration(
            border: Border(top: BorderSide(color: PpdColors.hairline)),
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _KindIcon(notification: n),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (meta.isNotEmpty)
                      Kicker(
                        meta,
                        color: injury
                            ? const Color(0xFFFFD9D5)
                            : PpdColors.muted,
                        size: 11,
                      ),
                    const SizedBox(height: 2),
                    Text(
                      injury ? n.title.toUpperCase() : n.title,
                      style: injury
                          ? PpdType.headline(28, color: fg)
                          : TextStyle(
                              fontSize: 16,
                              fontWeight: FontWeight.w700,
                              color: fg,
                              decoration: cancelled
                                  ? TextDecoration.lineThrough
                                  : null,
                            ),
                    ),
                    if (n.body != null && n.body!.isNotEmpty) ...[
                      const SizedBox(height: 2),
                      Text(
                        n.body!,
                        style: TextStyle(
                          fontSize: 14,
                          color: injury
                              ? const Color(0xFFFFEDEA)
                              : const Color(0xFF3A3735),
                        ),
                      ),
                    ],
                  ],
                ),
              ),
              if (!n.read && !injury)
                Semantics(
                  label: 'No leído',
                  child: Container(
                    width: 9,
                    height: 9,
                    margin: const EdgeInsets.only(top: 8, left: 8),
                    decoration: const BoxDecoration(
                      color: PpdColors.star,
                      shape: BoxShape.circle,
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Ícono del aviso con el color de su significado.
class _KindIcon extends StatelessWidget {
  const _KindIcon({required this.notification});

  final AppNotification notification;

  @override
  Widget build(BuildContext context) {
    final n = notification;
    final code = n.sportCode ?? 'soccer';
    if (n.isInjury) {
      return const _Circle(
        color: PpdColors.surface,
        child: Icon(Icons.warning_amber_rounded, color: PpdColors.error),
      );
    }
    return switch (n.kind) {
      'match_result' => const _Circle(
        color: PpdColors.gold,
        child: Icon(Icons.emoji_events_outlined, color: PpdColors.ink),
      ),
      'callup' => SportBadge(code: code),
      'trainings' || 'event_changed' => const _Circle(
        color: PpdColors.cyan,
        child: Icon(Icons.event_repeat, color: PpdColors.onInk),
      ),
      'event_cancelled' => const _Circle(
        color: PpdColors.surface,
        border: true,
        child: Icon(Icons.block, color: PpdColors.muted),
      ),
      'link_invitation' => const _Circle(
        color: PpdColors.ink,
        child: Icon(Icons.mail_outline, color: PpdColors.onInk),
      ),
      _ => const _Circle(
        color: PpdColors.paper,
        child: Icon(Icons.notifications_none, color: PpdColors.ink),
      ),
    };
  }
}

class _Circle extends StatelessWidget {
  const _Circle({
    required this.color,
    required this.child,
    this.border = false,
  });

  final Color color;
  final Widget child;
  final bool border;

  @override
  Widget build(BuildContext context) => Container(
    width: 44,
    height: 44,
    decoration: BoxDecoration(
      color: color,
      shape: BoxShape.circle,
      border: border ? Border.all(color: PpdColors.line, width: 1.5) : null,
    ),
    alignment: Alignment.center,
    child: ExcludeSemantics(child: child),
  );
}

class _Empty extends StatelessWidget {
  const _Empty();

  @override
  Widget build(BuildContext context) => const Padding(
    padding: EdgeInsets.fromLTRB(24, 48, 24, 24),
    child: Column(
      children: [
        Icon(Icons.notifications_none, size: 48, color: PpdColors.muted),
        SizedBox(height: 12),
        Text(
          'No tiene avisos',
          style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700),
        ),
        SizedBox(height: 6),
        Text(
          'Aquí verá las convocatorias, cambios de horario y resultados de '
          'sus hijos.',
          textAlign: TextAlign.center,
        ),
      ],
    ),
  );
}
