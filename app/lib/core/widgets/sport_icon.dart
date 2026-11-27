import 'package:material_ui/material_ui.dart';

/// Ícono según el código del deporte del catálogo (solo visual).
IconData sportIcon(String code) => switch (code) {
  'soccer' || 'futsal' => Icons.sports_soccer,
  'basketball' => Icons.sports_basketball,
  'volleyball' => Icons.sports_volleyball,
  'american_football' => Icons.sports_football,
  'baseball' || 'softball' => Icons.sports_baseball,
  'tennis' => Icons.sports_tennis,
  'handball' => Icons.sports_handball,
  'rugby' => Icons.sports_rugby,
  _ => Icons.sports,
};

/// Etiqueta con ícono y nombre del deporte (el nombre viene de la API).
class SportChip extends StatelessWidget {
  const SportChip({super.key, required this.code, required this.name});

  final String code;
  final String name;

  @override
  Widget build(BuildContext context) {
    return Chip(
      avatar: Icon(sportIcon(code), size: 18),
      label: Text(name),
      visualDensity: VisualDensity.compact,
      materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
    );
  }
}
