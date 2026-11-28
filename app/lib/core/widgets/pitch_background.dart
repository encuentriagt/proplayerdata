import 'package:material_ui/material_ui.dart';

import '../theme/brand_colors.dart';
import 'motion.dart';

/// Fondo de cancha del inicio de sesión: franjas de césped que avanzan, las
/// líneas del medio campo y la luz verde de estadio.
class PitchBackground extends StatefulWidget {
  const PitchBackground({super.key});

  @override
  State<PitchBackground> createState() => _PitchBackgroundState();
}

class _PitchBackgroundState extends State<PitchBackground>
    with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(
    vsync: this,
    duration: const Duration(seconds: 7),
  );

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (continuousMotion(context)) {
      if (!_c.isAnimating) _c.repeat();
    } else {
      _c.stop();
    }
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => ExcludeSemantics(
    child: RepaintBoundary(
      child: AnimatedBuilder(
        animation: _c,
        builder: (_, _) => CustomPaint(painter: _PitchPainter(_c.value)),
      ),
    ),
  );
}

class _PitchPainter extends CustomPainter {
  _PitchPainter(this.t);

  final double t;

  @override
  void paint(Canvas canvas, Size size) {
    final rect = Offset.zero & size;
    canvas.drawRect(
      rect,
      Paint()
        ..shader = const LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [PpdColors.pitch, Color(0xFF0F2A19), PpdColors.pitchDark],
        ).createShader(rect),
    );
    // Franjas de césped que bajan.
    const band = 40.0;
    final stripe = Paint()..color = const Color(0x143FCB72);
    final shift = t * band * 2;
    for (var y = -band * 2 + shift; y < size.height; y += band * 2) {
      canvas.drawRect(Rect.fromLTWH(0, y, size.width, band), stripe);
    }
    // Medio campo: línea, círculo central y punto (se mueven apenas).
    final cy = size.height * .62 + (t < .5 ? t : 1 - t) * 28 - 7;
    final line = Paint()
      ..color = const Color(0x29FFFFFF)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2;
    canvas.drawLine(Offset(0, cy), Offset(size.width, cy), line);
    canvas.drawCircle(Offset(size.width / 2, cy), 70, line);
    canvas.drawCircle(
      Offset(size.width / 2, cy),
      5,
      Paint()..color = const Color(0x4DFFFFFF),
    );
    // Luz de estadio.
    canvas.drawRect(
      rect,
      Paint()
        ..shader = RadialGradient(
          center: Alignment.topCenter,
          radius: .9,
          colors: [
            const Color(0xFF3FCB72).withValues(alpha: .38),
            Colors.transparent,
          ],
        ).createShader(rect),
    );
  }

  @override
  bool shouldRepaint(_PitchPainter old) => old.t != t;
}
