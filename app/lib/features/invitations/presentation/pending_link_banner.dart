import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:material_ui/material_ui.dart';

import '../../../core/widgets/message_banner.dart';
import '../application/link_invitation.dart';

/// Aviso cuando llegó un enlace de vinculación y falta entrar o verificar.
class PendingLinkBanner extends ConsumerWidget {
  const PendingLinkBanner(this.message, {super.key});

  final String message;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final pending = ref.watch(linkInvitationProvider.select((s) => s.pending));
    if (!pending) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: MessageBanner(message, kind: BannerKind.info),
    );
  }
}
