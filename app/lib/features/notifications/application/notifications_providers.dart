import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../children/application/children_providers.dart';
import '../data/notifications_repository.dart';

/// Bandeja de avisos de la cuenta (todos los hijos y colegios).
final notificationsProvider = FutureProvider<NotificationsPage>((ref) async {
  if (ref.watch(currentUserIdProvider) == null) {
    return const NotificationsPage(items: [], unread: 0);
  }
  return ref.watch(notificationsRepositoryProvider).inbox();
});

/// Avisos sin leer (para la insignia de la pestaña).
final unreadNotificationsProvider = Provider<int>(
  (ref) => ref.watch(notificationsProvider).value?.unread ?? 0,
);
