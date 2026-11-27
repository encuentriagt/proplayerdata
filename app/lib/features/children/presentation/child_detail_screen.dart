import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';
import 'package:material_ui/material_ui.dart';

import '../../../core/network/api_exception.dart';
import '../../../core/theme/brand_colors.dart';
import '../../../core/time/guatemala_time.dart';
import '../../../core/widgets/error_view.dart';
import '../../../core/widgets/org_crest.dart';
import '../../../core/widgets/sport_icon.dart';
import '../../invitations/application/invitations_providers.dart';
import '../application/children_providers.dart';
import '../application/local_photos.dart';
import '../data/children_models.dart';
import '../data/children_repository.dart';
import 'child_avatar.dart';

/// Ficha del hijo: colegio, deportes y equipos. Permite desvincularlo.
class ChildDetailScreen extends ConsumerWidget {
  const ChildDetailScreen({super.key, required this.childId});

  final int childId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final child = ref.watch(childProvider(childId));
    return Scaffold(
      appBar: AppBar(title: Text(child.value?.firstName ?? 'Hijo')),
      body: switch (child) {
        AsyncData(:final value) when value == null => const Center(
          child: Padding(
            padding: EdgeInsets.all(24),
            child: Text(
              'Este hijo ya no está vinculado a su cuenta.',
              textAlign: TextAlign.center,
            ),
          ),
        ),
        AsyncData(:final value) => _ChildDetail(child: value!),
        AsyncError(:final error) => Center(
          child: ErrorView(
            error: error,
            onRetry: () => ref.invalidate(childrenProvider),
          ),
        ),
        _ => const Center(child: CircularProgressIndicator()),
      },
    );
  }
}

class _ChildDetail extends ConsumerStatefulWidget {
  const _ChildDetail({required this.child});

  final Child child;

  @override
  ConsumerState<_ChildDetail> createState() => _ChildDetailState();
}

class _ChildDetailState extends ConsumerState<_ChildDetail> {
  bool _unlinking = false;

  Future<void> _photoOptions() async {
    final child = widget.child;
    final hasLocal = ref.read(localPhotosProvider).containsKey(child.id);
    final choice = await showModalBottomSheet<String>(
      context: context,
      builder: (context) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Padding(
              padding: EdgeInsets.fromLTRB(16, 16, 16, 4),
              child: Text(
                'La foto se guarda solo en este teléfono. No se envía a '
                'nadie.',
                textAlign: TextAlign.center,
              ),
            ),
            ListTile(
              leading: const Icon(Icons.photo_camera_outlined),
              title: const Text('Tomar foto'),
              onTap: () => Navigator.pop(context, 'camera'),
            ),
            ListTile(
              leading: const Icon(Icons.photo_library_outlined),
              title: const Text('Elegir de la galería'),
              onTap: () => Navigator.pop(context, 'gallery'),
            ),
            if (hasLocal)
              ListTile(
                leading: const Icon(Icons.delete_outline),
                title: const Text('Quitar foto'),
                onTap: () => Navigator.pop(context, 'remove'),
              ),
          ],
        ),
      ),
    );
    if (choice == null || !mounted) return;
    final photos = ref.read(localPhotosProvider.notifier);
    try {
      switch (choice) {
        case 'camera':
          await photos.pick(child.id, ImageSource.camera);
        case 'gallery':
          await photos.pick(child.id, ImageSource.gallery);
        case 'remove':
          await photos.remove(child.id);
      }
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'No se pudo usar la cámara o la galería. Revise los permisos de '
            'la App.',
          ),
        ),
      );
    }
  }

  Future<void> _unlink() async {
    final child = widget.child;
    final ok = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text('¿Desvincular a ${child.firstName}?'),
        content: Text(
          'Ya no verá los partidos, entrenos ni estadísticas de '
          '${child.firstName}. Para volver a vincularlo necesitará una '
          'nueva invitación de ${child.organization.name}.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancelar'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            style: TextButton.styleFrom(foregroundColor: PpdColors.error),
            child: const Text('Desvincular'),
          ),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    setState(() => _unlinking = true);
    try {
      await ref.read(childrenRepositoryProvider).unlink(child.id);
      await ref
          .read(localPhotosProvider.notifier)
          .remove(child.id)
          .catchError((_) {});
      if (!mounted) return;
      refreshFamily(ref);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Se desvinculó a ${child.firstName}.')),
      );
      context.pop();
    } on ApiException catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(e.message)));
    } finally {
      if (mounted) setState(() => _unlinking = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final child = widget.child;
    final text = Theme.of(context).textTheme;
    final age = child.ageOn(GuatemalaTime.toLocal(DateTime.now()));

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 24, 16, 32),
      children: [
        Center(
          child: Semantics(
            button: true,
            label: 'Cambiar la foto de ${child.firstName}',
            child: InkWell(
              customBorder: const CircleBorder(),
              onTap: _photoOptions,
              child: Stack(
                children: [
                  ChildAvatar(child: child, radius: 48),
                  const Positioned(
                    right: 0,
                    bottom: 0,
                    child: CircleAvatar(
                      radius: 16,
                      backgroundColor: PpdColors.star,
                      child: Icon(
                        Icons.photo_camera,
                        size: 18,
                        color: PpdColors.ink,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
        const SizedBox(height: 12),
        Text(
          child.fullName,
          textAlign: TextAlign.center,
          style: text.headlineSmall?.copyWith(fontWeight: FontWeight.w700),
        ),
        if (age != null)
          Text(
            '$age años',
            textAlign: TextAlign.center,
            style: text.bodyMedium?.copyWith(color: PpdColors.muted),
          ),
        const SizedBox(height: 16),
        Card(
          child: ListTile(
            leading: OrgCrest(url: child.organization.crestUrl, size: 36),
            title: Text(
              child.organization.name,
              style: const TextStyle(fontWeight: FontWeight.w600),
            ),
            subtitle: const Text('Colegio o equipo'),
          ),
        ),
        const SizedBox(height: 16),
        Text(
          'Deportes y equipos',
          style: text.titleMedium?.copyWith(fontWeight: FontWeight.w700),
        ),
        const SizedBox(height: 8),
        if (child.teams.isEmpty)
          const Card(
            child: Padding(
              padding: EdgeInsets.all(16),
              child: Text('Todavía no está en ningún equipo.'),
            ),
          )
        else
          for (final team in child.teams) _TeamCard(team: team),
        const SizedBox(height: 24),
        TextButton.icon(
          onPressed: _unlinking ? null : _unlink,
          icon: const Icon(Icons.link_off),
          label: Text('Desvincular a ${child.firstName}'),
          style: TextButton.styleFrom(foregroundColor: PpdColors.error),
        ),
      ],
    );
  }
}

class _TeamCard extends StatelessWidget {
  const _TeamCard({required this.team});

  final ChildTeam team;

  @override
  Widget build(BuildContext context) {
    final details = [
      if (team.category != null && team.category!.isNotEmpty) team.category!,
      if (team.season != null) team.season!.name,
    ].join(' · ');
    final player = [
      if (team.jerseyNumber != null && team.jerseyNumber!.isNotEmpty)
        'Dorsal ${team.jerseyNumber}',
      if (team.position != null) team.position!.name,
    ].join(' · ');
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: ListTile(
        leading: CircleAvatar(
          backgroundColor: PpdColors.paper,
          foregroundColor: PpdColors.ink,
          child: Icon(sportIcon(team.sport.code)),
        ),
        title: Text(
          team.name,
          style: const TextStyle(fontWeight: FontWeight.w600),
        ),
        subtitle: Text(
          [
            team.sport.name,
            if (details.isNotEmpty) details,
            if (player.isNotEmpty) player,
          ].join('\n'),
        ),
        isThreeLine: details.isNotEmpty && player.isNotEmpty,
      ),
    );
  }
}
