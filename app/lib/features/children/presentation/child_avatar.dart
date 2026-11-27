import 'package:material_ui/material_ui.dart';

import '../../../core/theme/brand_colors.dart';
import '../data/children_models.dart';

/// Foto del hijo o sus iniciales. La foto es una URL firmada (15 min):
/// solo se guarda en memoria, nunca en disco.
class ChildAvatar extends StatelessWidget {
  const ChildAvatar({super.key, required this.child, this.radius = 28});

  final Child child;
  final double radius;

  @override
  Widget build(BuildContext context) {
    final initials = Text(
      child.initials,
      style: TextStyle(
        color: PpdColors.onInk,
        fontWeight: FontWeight.w700,
        fontSize: radius * 0.7,
      ),
    );
    final url = child.photoUrl;
    return CircleAvatar(
      radius: radius,
      backgroundColor: PpdColors.ink,
      child: url == null || url.isEmpty
          ? initials
          : ClipOval(
              child: Image.network(
                url,
                width: radius * 2,
                height: radius * 2,
                fit: BoxFit.cover,
                errorBuilder: (_, _, _) => initials,
              ),
            ),
    );
  }
}
