import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';

import '../../../core/network/api_exception.dart';
import '../../../core/network/idempotency.dart';
import '../../../core/theme/brand_colors.dart';
import '../../../core/time/guatemala_time.dart';
import '../../../core/widgets/error_view.dart';
import '../../../core/widgets/org_crest.dart';
import '../../../core/widgets/sport_icon.dart';
import '../application/invitations_providers.dart';
import '../data/invitation_models.dart';
import '../data/invitations_repository.dart';

/// Errores tras los cuales la invitación ya no sirve: se refresca la lista.
const _closedCodes = {
  'invitation_not_found',
  'invitation_closed',
  'invitation_used',
};

class InvitationsScreen extends ConsumerStatefulWidget {
  const InvitationsScreen({super.key});

  @override
  ConsumerState<InvitationsScreen> createState() => _InvitationsScreenState();
}

class _InvitationsScreenState extends ConsumerState<InvitationsScreen> {
  /// Invitación en curso (aceptar o rechazar).
  int? _busyId;

  /// Una clave por invitación: si falla la red, el reintento usa la misma.
  final _keys = <int, IdempotencyKey>{};

  void _show(String message) =>
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(message)));

  Future<void> _accept(Invitation inv) async {
    final key = _keys[inv.id] ??= IdempotencyKey();
    setState(() => _busyId = inv.id);
    try {
      await ref.read(invitationsRepositoryProvider).accept(inv.id, key);
      _keys.remove(inv.id);
      if (!mounted) return;
      refreshFamily(ref);
      _show('Listo: ${inv.playerFirstName} quedó vinculado a su cuenta.');
    } on ApiException catch (e) {
      if (!e.isNetwork) _keys.remove(inv.id);
      if (!mounted) return;
      _show(e.message);
      if (_closedCodes.contains(e.code)) refreshFamily(ref);
    } finally {
      if (mounted) setState(() => _busyId = null);
    }
  }

  Future<void> _decline(Invitation inv) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('¿Rechazar la invitación?'),
        content: Text(
          'No se vinculará a ${inv.playerFirstName} con su cuenta. Si fue un '
          'error, pida a ${inv.organization.name} una nueva invitación.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancelar'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            style: TextButton.styleFrom(foregroundColor: PpdColors.error),
            child: const Text('Rechazar'),
          ),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    setState(() => _busyId = inv.id);
    try {
      await ref.read(invitationsRepositoryProvider).decline(inv.id);
      if (!mounted) return;
      refreshFamily(ref);
      _show('Invitación rechazada.');
    } on ApiException catch (e) {
      if (!mounted) return;
      _show(e.message);
      if (_closedCodes.contains(e.code)) refreshFamily(ref);
    } finally {
      if (mounted) setState(() => _busyId = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    final invitations = ref.watch(invitationsProvider);
    return Scaffold(
      appBar: AppBar(
        title: const Text('Invitaciones'),
        actions: [
          TextButton(
            onPressed: () => context.push('/codigo'),
            style: TextButton.styleFrom(foregroundColor: PpdColors.onInk),
            child: const Text('Tengo un código'),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(invitationsProvider);
          await ref
              .read(invitationsProvider.future)
              .catchError((_) => <Invitation>[]);
        },
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
          children: switch (invitations) {
            AsyncData(:final value) when value.isEmpty => [const _Empty()],
            AsyncData(:final value) => [
              for (final inv in value)
                _InvitationCard(
                  invitation: inv,
                  busy: _busyId == inv.id,
                  disabled: _busyId != null,
                  onAccept: () => _accept(inv),
                  onDecline: () => _decline(inv),
                ),
            ],
            AsyncError(:final error) => [
              ErrorView(
                error: error,
                onRetry: () => ref.invalidate(invitationsProvider),
              ),
            ],
            _ => [
              const Padding(
                padding: EdgeInsets.all(32),
                child: Center(child: CircularProgressIndicator()),
              ),
            ],
          },
        ),
      ),
    );
  }
}

class _InvitationCard extends StatelessWidget {
  const _InvitationCard({
    required this.invitation,
    required this.busy,
    required this.disabled,
    required this.onAccept,
    required this.onDecline,
  });

  final Invitation invitation;
  final bool busy;
  final bool disabled;
  final VoidCallback onAccept;
  final VoidCallback onDecline;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final inv = invitation;
    final expires = inv.expiresAt == null
        ? null
        : DateTime.tryParse(inv.expiresAt!);
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                OrgCrest(url: inv.organization.crestUrl, size: 32),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    inv.organization.name,
                    style: text.titleSmall?.copyWith(
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            Text(
              'Vincular a ${inv.playerFirstName}',
              style: text.titleLarge?.copyWith(fontWeight: FontWeight.w700),
            ),
            if (inv.teams.isNotEmpty) ...[
              const SizedBox(height: 8),
              Wrap(
                spacing: 6,
                runSpacing: 6,
                children: [
                  for (final t in inv.teams)
                    SportChip(
                      code: t.sport.code,
                      name: '${t.sport.name} · ${t.name}',
                    ),
                ],
              ),
            ],
            if (expires != null) ...[
              const SizedBox(height: 8),
              Text(
                'Vence el ${GuatemalaTime.longDate(GuatemalaTime.toLocal(expires))}',
                style: text.bodySmall?.copyWith(color: PpdColors.muted),
              ),
            ],
            const SizedBox(height: 16),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: disabled ? null : onDecline,
                    style: OutlinedButton.styleFrom(
                      minimumSize: const Size.fromHeight(48),
                    ),
                    child: const Text('Rechazar'),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: FilledButton(
                    onPressed: disabled ? null : onAccept,
                    child: busy
                        ? const SizedBox(
                            width: 22,
                            height: 22,
                            child: CircularProgressIndicator(strokeWidth: 2.5),
                          )
                        : const Text('Aceptar'),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _Empty extends StatelessWidget {
  const _Empty();

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 32),
      child: Column(
        children: [
          const Icon(
            Icons.mark_email_read_outlined,
            size: 48,
            color: PpdColors.muted,
          ),
          const SizedBox(height: 12),
          Text(
            'No tiene invitaciones pendientes',
            style: text.titleMedium?.copyWith(fontWeight: FontWeight.w700),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 8),
          Text(
            'Las invitaciones llegan cuando el colegio inscribe a su hijo con '
            'el correo de su cuenta. Si recibió un código en otro correo, '
            'toque «Tengo un código».',
            style: text.bodyMedium,
            textAlign: TextAlign.center,
          ),
        ],
      ),
    );
  }
}
