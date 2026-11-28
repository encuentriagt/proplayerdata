import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';
import 'package:material_ui/material_ui.dart';

import '../../../core/network/api_exception.dart';
import '../../../core/theme/brand_colors.dart';
import '../../../core/theme/typography.dart';
import '../../../core/time/guatemala_time.dart';
import '../../../core/widgets/error_view.dart';
import '../../../core/widgets/org_crest.dart';
import '../../../core/widgets/sport_icon.dart';
import '../../invitations/application/invitations_providers.dart';
import '../../sports/application/sports_providers.dart';
import '../../sports/data/sport_models.dart';
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
      appBar: child.value == null
          ? AppBar(title: Text(child.value?.firstName ?? 'Hijo'))
          : null,
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
            const SizedBox(height: 8),
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

  /// Con foto: pantalla de la foto con «Cambiar foto» y «Quitar foto».
  Future<void> _onPhotoTap() async {
    final child = widget.child;
    final has = ref.read(localPhotosProvider).containsKey(child.id);
    if (!has) return _photoOptions();
    final choice = await Navigator.of(context).push<String>(
      MaterialPageRoute(
        fullscreenDialog: true,
        builder: (_) => _PhotoScreen(child: child),
      ),
    );
    if (!mounted) return;
    if (choice == 'change') await _photoOptions();
    if (choice == 'remove') {
      await ref.read(localPhotosProvider.notifier).remove(child.id);
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
    final team = child.teams.firstOrNull;
    final stats = ref.watch(childStatsProvider(child.id)).value;
    final sportStats = stats?.forSport(team?.sport.id);

    return ListView(
      padding: const EdgeInsets.only(bottom: 32),
      children: [
        _Hero(child: child, onPhotoTap: _onPhotoTap),
        if (sportStats != null)
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 0),
            child: _SeasonStats(stats: sportStats),
          ),
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 20, 20, 0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
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
          ),
        ),
      ],
    );
  }
}

/// Portada del perfil: color del deporte, silueta, nombre grande y la foto
/// en círculo a la derecha del nombre (alineada con el apellido).
class _Hero extends StatelessWidget {
  const _Hero({required this.child, required this.onPhotoTap});

  final Child child;
  final VoidCallback onPhotoTap;

  @override
  Widget build(BuildContext context) {
    final team = child.teams.firstOrNull;
    final code = team?.sport.code ?? 'soccer';
    final p = sportPalette(code);
    final age = child.ageOn(GuatemalaTime.toLocal(DateTime.now()));
    final kicker = [
      if (team?.jerseyNumber != null) '#${team!.jerseyNumber}',
      ?team?.position?.name,
      ?team?.category,
    ].where((s) => s.isNotEmpty).join(' · ');
    final lastName = child.lastName.isEmpty ? '' : child.lastName;
    final on = p.onMain;

    return Container(
      decoration: BoxDecoration(
        gradient: RadialGradient(
          center: const Alignment(.4, -.4),
          radius: 1.1,
          colors: [p.main, p.deep],
        ),
      ),
      clipBehavior: Clip.hardEdge,
      child: SafeArea(
        bottom: false,
        child: Stack(
          children: [
            Positioned(
              right: -30,
              top: 20,
              child: Opacity(
                opacity: .4,
                child: SportSilhouette(
                  code: code,
                  color: on == PpdColors.ink ? PpdColors.ink : Colors.white,
                  size: 280,
                  fade: true,
                  mirror: true,
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(8, 4, 20, 20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  IconButton(
                    tooltip: 'Atrás',
                    color: on,
                    onPressed: () => context.pop(),
                    icon: const Icon(Icons.arrow_back),
                  ),
                  Padding(
                    padding: const EdgeInsets.only(left: 12),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        if (kicker.isNotEmpty)
                          Text(
                            kicker.toUpperCase(),
                            style: PpdType.label(size: 13, color: on),
                          ),
                        const SizedBox(height: 70),
                        Row(
                          crossAxisAlignment: CrossAxisAlignment.end,
                          children: [
                            Expanded(
                              child: Semantics(
                                header: true,
                                label: child.fullName,
                                excludeSemantics: true,
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    _FitLine(child.firstName, color: on),
                                    if (lastName.isNotEmpty)
                                      _FitLine(
                                        lastName,
                                        color: on == PpdColors.ink
                                            ? Colors.white
                                            : PpdColors.gold,
                                      ),
                                  ],
                                ),
                              ),
                            ),
                            const SizedBox(width: 14),
                            Semantics(
                              button: true,
                              label: 'Foto de ${child.firstName}',
                              child: GestureDetector(
                                onTap: onPhotoTap,
                                child: Container(
                                  decoration: BoxDecoration(
                                    shape: BoxShape.circle,
                                    border: Border.all(
                                      color: Colors.white,
                                      width: 5,
                                    ),
                                    boxShadow: const [
                                      BoxShadow(
                                        color: Color(0x593C1E00),
                                        blurRadius: 30,
                                        offset: Offset(0, 12),
                                      ),
                                    ],
                                  ),
                                  child: ChildAvatar(child: child, radius: 59),
                                ),
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 8),
                        Text(
                          [
                            if (age != null) '$age años',
                            child.organization.name,
                            ?team?.season?.name,
                          ].join(' · '),
                          style: TextStyle(
                            fontSize: 14,
                            fontWeight: FontWeight.w500,
                            color: on.withValues(alpha: .85),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Una línea del nombre que se achica para caber (apellidos largos).
class _FitLine extends StatelessWidget {
  const _FitLine(this.text, {required this.color});

  final String text;
  final Color color;

  @override
  Widget build(BuildContext context) => FittedBox(
    fit: BoxFit.scaleDown,
    alignment: Alignment.centerLeft,
    child: Padding(
      // Espacio para la inclinación de la cursiva.
      padding: const EdgeInsets.only(right: 8),
      child: Text(
        text.toUpperCase(),
        maxLines: 1,
        style: PpdType.headline(72, color: color, height: .92),
      ),
    ),
  );
}

/// Cifras de la temporada con una línea de color a la izquierda.
class _SeasonStats extends StatelessWidget {
  const _SeasonStats({required this.stats});

  final SportStats stats;

  @override
  Widget build(BuildContext context) {
    final items = <(String, int, Color, Color)>[
      ('Partidos', stats.matches, PpdColors.ink, PpdColors.ink),
      for (final (i, s) in stats.stats.take(2).indexed)
        (
          s.name,
          s.value,
          i == 0 ? PpdColors.green : PpdColors.cyan,
          i == 0 ? PpdColors.greenText : PpdColors.cyanText,
        ),
      ('Min.', stats.minutes, PpdColors.star, PpdColors.goldText),
    ];
    return Container(
      decoration: const BoxDecoration(
        border: Border(bottom: BorderSide(color: PpdColors.ink)),
      ),
      child: Row(
        children: [
          for (final (label, value, bar, color) in items)
            Expanded(
              child: Container(
                padding: const EdgeInsets.fromLTRB(10, 10, 4, 10),
                decoration: BoxDecoration(
                  border: Border(left: BorderSide(color: bar, width: 4)),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    FittedBox(
                      fit: BoxFit.scaleDown,
                      child: Text(
                        '$value',
                        style: PpdType.headline(
                          44,
                          color: color,
                          italic: false,
                        ),
                      ),
                    ),
                    Text(
                      label.toUpperCase(),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: PpdType.label(size: 11, color: PpdColors.muted),
                    ),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }
}

/// Pantalla de la foto: grande, con «Cambiar foto» y «Quitar foto».
class _PhotoScreen extends StatelessWidget {
  const _PhotoScreen({required this.child});

  final Child child;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: PpdColors.ink,
      appBar: AppBar(
        backgroundColor: PpdColors.ink,
        foregroundColor: Colors.white,
        leading: IconButton(
          tooltip: 'Cerrar',
          icon: const Icon(Icons.close),
          onPressed: () => Navigator.pop(context),
        ),
        title: Text(
          'Foto de ${child.firstName}'.toUpperCase(),
          style: PpdType.headline(26, color: Colors.white),
        ),
      ),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(24, 0, 24, 24),
          child: Column(
            children: [
              Expanded(
                child: Center(
                  child: Container(
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      border: Border.all(color: PpdColors.gold, width: 6),
                    ),
                    child: ChildAvatar(child: child, radius: 150),
                  ),
                ),
              ),
              FilledButton.icon(
                onPressed: () => Navigator.pop(context, 'change'),
                style: FilledButton.styleFrom(
                  backgroundColor: PpdColors.gold,
                  foregroundColor: PpdColors.ink,
                ),
                icon: const Icon(Icons.photo_camera_outlined),
                label: const Text('Cambiar foto'),
              ),
              const SizedBox(height: 12),
              OutlinedButton.icon(
                onPressed: () => Navigator.pop(context, 'remove'),
                style: OutlinedButton.styleFrom(
                  minimumSize: const Size.fromHeight(52),
                  foregroundColor: const Color(0xFFFF8A80),
                  side: const BorderSide(color: Color(0xFFFF8A80), width: 1.5),
                ),
                icon: const Icon(Icons.delete_outline),
                label: const Text('Quitar foto'),
              ),
            ],
          ),
        ),
      ),
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
        leading: SportBadge(code: team.sport.code, size: 40),
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
