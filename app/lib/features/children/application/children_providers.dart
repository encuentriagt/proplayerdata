import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../auth/application/session_controller.dart';
import '../data/children_models.dart';
import '../data/children_repository.dart';

/// Id de la cuenta con sesión: los datos se reinician al cambiar de cuenta.
final currentUserIdProvider = Provider<int?>((ref) {
  final session = ref.watch(sessionControllerProvider);
  return session is SignedIn ? session.profile.user.id : null;
});

/// Hijos vinculados a la cuenta (de todas sus organizaciones).
final childrenProvider = FutureProvider<List<Child>>((ref) async {
  if (ref.watch(currentUserIdProvider) == null) return const [];
  return ref.watch(childrenRepositoryProvider).children();
});

/// Un hijo por id, tomado de la lista ya cargada.
final childProvider = Provider.family<AsyncValue<Child?>, int>((ref, id) {
  return ref.watch(childrenProvider).whenData((list) {
    for (final c in list) {
      if (c.id == id) return c;
    }
    return null;
  });
});
