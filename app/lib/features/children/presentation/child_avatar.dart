import 'dart:io';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:material_ui/material_ui.dart';

import '../../../core/theme/brand_colors.dart';
import '../application/local_photos.dart';
import '../data/children_models.dart';

/// Foto del hijo: la que el padre puso en el teléfono; si no, la del colegio
/// (URL firmada de 15 min, solo en memoria); si no, sus iniciales.
class ChildAvatar extends ConsumerWidget {
  const ChildAvatar({super.key, required this.child, this.radius = 28});

  final Child child;
  final double radius;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final local = ref.watch(localPhotosProvider.select((m) => m[child.id]));
    final initials = Text(
      child.initials,
      style: TextStyle(
        color: PpdColors.onInk,
        fontWeight: FontWeight.w700,
        fontSize: radius * 0.7,
      ),
    );
    Widget? image;
    if (local != null) {
      image = Image.file(
        File(local),
        width: radius * 2,
        height: radius * 2,
        fit: BoxFit.cover,
        errorBuilder: (_, _, _) => initials,
      );
    } else if (child.photoUrl != null && child.photoUrl!.isNotEmpty) {
      image = Image.network(
        child.photoUrl!,
        width: radius * 2,
        height: radius * 2,
        fit: BoxFit.cover,
        errorBuilder: (_, _, _) => initials,
      );
    }
    return CircleAvatar(
      radius: radius,
      backgroundColor: PpdColors.ink,
      child: image == null ? initials : ClipOval(child: image),
    );
  }
}
