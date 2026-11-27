import 'package:material_ui/material_ui.dart';

import '../theme/brand_colors.dart';

/// Escudo del colegio (público). Solo es un dato: la App no toma su marca.
class OrgCrest extends StatelessWidget {
  const OrgCrest({super.key, this.url, this.size = 24});

  final String? url;
  final double size;

  @override
  Widget build(BuildContext context) {
    final fallback = Icon(
      Icons.shield_outlined,
      size: size,
      color: PpdColors.muted,
    );
    final src = url;
    if (src == null || src.isEmpty) return fallback;
    return Image.network(
      src,
      width: size,
      height: size,
      fit: BoxFit.contain,
      errorBuilder: (_, _, _) => fallback,
    );
  }
}
