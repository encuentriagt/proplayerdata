import 'package:material_ui/material_ui.dart';
import 'package:flutter_svg/flutter_svg.dart';

import '../theme/brand_colors.dart';
import '../theme/typography.dart';

/// Logotipo de ProPlayer Data según la guía oficial (v1, nov 2026).
///
/// - Principal horizontal: símbolo + «PROPLAYER» + «DATA ★ EN VIVO».
/// - Reducida ([reduced]): sin descriptor, para espacios pequeños.
/// - [negative]: para fondos oscuros (tinta clara).
///
/// Proporciones de la guía: símbolo 104 · separación 20 · palabra 64 ·
/// descriptor 16 (0.25 de la palabra), espaciado .3em.
class ProPlayerLogo extends StatelessWidget {
  const ProPlayerLogo({
    super.key,
    this.size = 56,
    this.reduced = false,
    this.negative = false,
  });

  /// Alto del símbolo.
  final double size;
  final bool reduced;
  final bool negative;

  @override
  Widget build(BuildContext context) {
    final ink = negative ? PpdColors.paper : PpdColors.ink;
    final word = reduced ? size * 52 / 72 : size * 64 / 104;
    final gap = reduced ? size * 16 / 72 : size * 20 / 104;
    final sub = word * .25;
    return Semantics(
      label: reduced ? 'ProPlayer Data' : 'ProPlayer Data · En vivo',
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          ProPlayerMark(size: size, negative: negative),
          SizedBox(width: gap),
          ExcludeSemantics(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'PROPLAYER',
                  style: PpdType.headline(word, color: ink, height: .85),
                ),
                if (!reduced) ...[
                  SizedBox(height: word * 9 / 64),
                  Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text('DATA', style: _sub(sub, ink, .3)),
                      SizedBox(width: word * 9 / 64),
                      Text(
                        '★',
                        style: TextStyle(
                          fontSize: sub,
                          color: PpdColors.star,
                          height: 1,
                        ),
                      ),
                      SizedBox(width: word * 9 / 64),
                      Text('EN VIVO', style: _sub(sub, ink, .14)),
                    ],
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }

  static TextStyle _sub(double size, Color color, double spacing) => TextStyle(
    fontFamily: PpdType.display,
    fontWeight: FontWeight.w600,
    fontStyle: FontStyle.italic,
    fontSize: size,
    height: 1,
    letterSpacing: spacing * size,
    color: color,
  );
}

/// Solo el símbolo (escudo con estrellas, barras y balones).
class ProPlayerMark extends StatelessWidget {
  const ProPlayerMark({super.key, this.size = 32, this.negative = false});

  final double size;
  final bool negative;

  @override
  Widget build(BuildContext context) {
    return SvgPicture.asset(
      negative
          ? 'assets/brand/proplayer_mark_negative.svg'
          : 'assets/brand/proplayer_mark.svg',
      width: size,
      height: size,
      excludeFromSemantics: true,
    );
  }
}
