import 'package:flutter_svg/flutter_svg.dart';
import 'package:material_ui/material_ui.dart';

import '../theme/brand_colors.dart';

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

/// Colores de un deporte: el color del logo que le corresponde.
class SportPalette {
  const SportPalette({
    required this.main,
    required this.deep,
    required this.text,
    required this.soft,
    required this.onMain,
  });

  /// Fondo de bloques y portadas.
  final Color main;

  /// Final del degradado.
  final Color deep;

  /// Texto pequeño sobre blanco (AA).
  final Color text;

  /// Fondo de etiquetas.
  final Color soft;

  /// Texto sobre [main].
  final Color onMain;
}

const _green = SportPalette(
  main: PpdColors.greenText,
  deep: PpdColors.greenDeep,
  text: PpdColors.greenText,
  soft: PpdColors.greenSoft,
  onMain: PpdColors.onInk,
);
const _gold = SportPalette(
  main: PpdColors.gold,
  deep: PpdColors.star,
  text: PpdColors.goldText,
  soft: PpdColors.goldSoft,
  onMain: PpdColors.ink,
);
const _blue = SportPalette(
  main: PpdColors.cyan,
  deep: PpdColors.cyanDeep,
  text: PpdColors.cyanText,
  soft: PpdColors.cyanSoft,
  onMain: PpdColors.onInk,
);
const _leather = SportPalette(
  main: PpdColors.leather,
  deep: Color(0xFF5E3118),
  text: PpdColors.leather,
  soft: Color(0xFFF2E4DA),
  onMain: PpdColors.onInk,
);

/// Verde = fútbol, oro = básquetbol, azul = béisbol; los demás alternan.
SportPalette sportPalette(String code) => switch (code) {
  'soccer' || 'futsal' => _green,
  'basketball' => _gold,
  'baseball' || 'softball' => _blue,
  'volleyball' || 'handball' => _blue,
  'american_football' || 'rugby' => _leather,
  _ => _green,
};

/// Silueta oficial del deporte (dominio público, Openclipart), si existe.
String? sportSilhouetteAsset(String code) => switch (code) {
  'soccer' || 'futsal' => 'assets/sports/futbol.svg',
  'basketball' => 'assets/sports/basquet.svg',
  'baseball' || 'softball' => 'assets/sports/beisbol.svg',
  _ => null,
};

/// Silueta de un atleta del deporte en un solo color.
///
/// [fade] la desvanece hacia los bordes para que se pierda con el fondo;
/// [mirror] la voltea. Si el deporte no tiene silueta, muestra su ícono.
class SportSilhouette extends StatelessWidget {
  const SportSilhouette({
    super.key,
    required this.code,
    required this.color,
    this.size = 48,
    this.fade = false,
    this.mirror = false,
  });

  final String code;
  final Color color;
  final double size;
  final bool fade;
  final bool mirror;

  @override
  Widget build(BuildContext context) {
    final asset = sportSilhouetteAsset(code);
    Widget child = asset == null
        ? Icon(sportIcon(code), size: size * .8, color: color)
        : SvgPicture.asset(
            asset,
            width: size,
            height: size,
            colorFilter: ColorFilter.mode(color, BlendMode.srcIn),
            excludeFromSemantics: true,
          );
    if (mirror) {
      child = Transform.flip(flipX: true, child: child);
    }
    if (fade) {
      child = ShaderMask(
        blendMode: BlendMode.dstIn,
        shaderCallback: (rect) => const RadialGradient(
          radius: .62,
          colors: [Colors.black, Colors.black, Colors.transparent],
          stops: [0, .55, 1],
        ).createShader(rect),
        child: child,
      );
    }
    return ExcludeSemantics(
      child: SizedBox(
        width: size,
        height: size,
        child: Center(child: child),
      ),
    );
  }
}

/// Círculo del color del deporte con la silueta en blanco.
class SportBadge extends StatelessWidget {
  const SportBadge({super.key, required this.code, this.size = 44});

  final String code;
  final double size;

  @override
  Widget build(BuildContext context) {
    final p = sportPalette(code);
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(color: p.main, shape: BoxShape.circle),
      alignment: Alignment.center,
      child: SportSilhouette(code: code, color: p.onMain, size: size * .74),
    );
  }
}

/// Etiqueta con el nombre del deporte en su color (el nombre viene de la API).
class SportChip extends StatelessWidget {
  const SportChip({super.key, required this.code, required this.name});

  final String code;
  final String name;

  @override
  Widget build(BuildContext context) {
    final p = sportPalette(code);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
      decoration: ShapeDecoration(color: p.soft, shape: const StadiumBorder()),
      child: Text(
        name,
        style: TextStyle(
          fontSize: 12,
          fontWeight: FontWeight.w700,
          color: p.text,
        ),
      ),
    );
  }
}
