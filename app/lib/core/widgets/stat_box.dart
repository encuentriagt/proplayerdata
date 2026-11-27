import 'package:material_ui/material_ui.dart';

import '../theme/brand_colors.dart';

/// Cifra grande con su nombre (goles, minutos, partidos…).
class StatBox extends StatelessWidget {
  const StatBox({super.key, required this.name, required this.value});

  final String name;
  final int value;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Container(
      width: 96,
      padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 8),
      decoration: BoxDecoration(
        color: PpdColors.paper,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        children: [
          Text(
            '$value',
            style: text.headlineSmall?.copyWith(fontWeight: FontWeight.w800),
          ),
          Text(name, style: text.bodySmall, textAlign: TextAlign.center),
        ],
      ),
    );
  }
}
