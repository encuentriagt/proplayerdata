import 'package:material_ui/material_ui.dart';

import '../theme/brand_colors.dart';
import '../theme/typography.dart';
import '../time/guatemala_time.dart';

/// Encabezado de pestaña: título grande en cursiva y acción opcional.
class BigTitle extends StatelessWidget {
  const BigTitle(this.text, {super.key, this.subtitle, this.trailing});

  final String text;
  final String? subtitle;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 16, 12, 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Semantics(
                  header: true,
                  child: Text(
                    text.toUpperCase(),
                    style: PpdType.headline(52, color: PpdColors.ink),
                  ),
                ),
                if (subtitle != null) ...[
                  const SizedBox(height: 6),
                  Text(
                    subtitle!.toUpperCase(),
                    style: PpdType.label(color: PpdColors.muted),
                  ),
                ],
              ],
            ),
          ),
          ?trailing,
        ],
      ),
    );
  }
}

/// Etiqueta pequeña en mayúsculas («LOS PINOS · FÚTBOL»).
class Kicker extends StatelessWidget {
  const Kicker(this.text, {super.key, this.color = PpdColors.muted, this.size});

  final String text;
  final Color color;
  final double? size;

  @override
  Widget build(BuildContext context) => Text(
    text.toUpperCase(),
    style: PpdType.label(size: size ?? 12, color: color),
  );
}

/// Píldora de color con texto (y opcionalmente un ícono).
class PillTag extends StatelessWidget {
  const PillTag(
    this.text, {
    super.key,
    required this.background,
    required this.foreground,
    this.icon,
  });

  final String text;
  final Color background;
  final Color foreground;
  final Widget? icon;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
    decoration: ShapeDecoration(
      color: background,
      shape: const StadiumBorder(),
    ),
    child: Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        if (icon != null) ...[icon!, const SizedBox(width: 6)],
        Text(
          text.toUpperCase(),
          style: PpdType.label(size: 11, color: foreground),
        ),
      ],
    ),
  );
}

/// «hace 5 min», «hoy 10:12 a. m.», «ayer», «22 nov.».
String relativeTime(String? iso, {DateTime? now}) {
  if (iso == null) return '';
  final DateTime when;
  try {
    when = GuatemalaTime.parse(iso);
  } catch (_) {
    return '';
  }
  final current = now ?? GuatemalaTime.toLocal(DateTime.now());
  final diff = current.difference(when);
  if (diff.inMinutes < 1) return 'ahora';
  if (diff.inMinutes < 60) return 'hace ${diff.inMinutes} min';
  final today = DateTime(current.year, current.month, current.day);
  final day = DateTime(when.year, when.month, when.day);
  if (day == today) return 'hoy ${GuatemalaTime.time(when)}';
  if (day == today.subtract(const Duration(days: 1))) return 'ayer';
  return GuatemalaTime.shortDate(when);
}
