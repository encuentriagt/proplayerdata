import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../children/application/children_providers.dart';
import '../data/invitation_models.dart';
import '../data/invitations_repository.dart';

/// Invitaciones de vínculo pendientes.
final invitationsProvider = FutureProvider<List<Invitation>>((ref) async {
  if (ref.watch(currentUserIdProvider) == null) return const [];
  return ref.watch(invitationsRepositoryProvider).pending();
});

/// Refresca hijos e invitaciones (tras aceptar, rechazar o desvincular).
void refreshFamily(WidgetRef ref) {
  ref.invalidate(childrenProvider);
  ref.invalidate(invitationsProvider);
}
