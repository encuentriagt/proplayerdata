import 'package:material_ui/material_ui.dart';
import 'package:flutter_svg/flutter_svg.dart';

import '../theme/brand_colors.dart';

/// Escudo y logotipo de ProPlayer Data.
class ProPlayerLogo extends StatelessWidget {
  const ProPlayerLogo({super.key, this.size = 56});

  final double size;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: 'ProPlayer Data',
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          SvgPicture.asset(
            'assets/brand/proplayer_mark.svg',
            width: size,
            height: size,
          ),
          SizedBox(width: size * 0.22),
          ExcludeSemantics(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'PROPLAYER',
                  style: TextStyle(
                    fontSize: size * 0.56,
                    fontWeight: FontWeight.w900,
                    fontStyle: FontStyle.italic,
                    height: 1,
                    color: PpdColors.ink,
                  ),
                ),
                Text.rich(
                  TextSpan(
                    children: [
                      const TextSpan(text: 'DATA '),
                      TextSpan(
                        text: '★',
                        style: TextStyle(color: PpdColors.star),
                      ),
                    ],
                  ),
                  style: TextStyle(
                    fontSize: size * 0.2,
                    fontWeight: FontWeight.w600,
                    fontStyle: FontStyle.italic,
                    letterSpacing: size * 0.06,
                    color: PpdColors.ink,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
