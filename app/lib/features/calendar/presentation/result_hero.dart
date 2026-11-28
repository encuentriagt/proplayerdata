import 'dart:math' as math;

import 'package:flutter_svg/flutter_svg.dart';
import 'package:material_ui/material_ui.dart';

import '../../../core/theme/brand_colors.dart';
import '../../../core/theme/typography.dart';
import '../../../core/time/guatemala_time.dart';
import '../data/event_models.dart';

/// Resultado del partido para el padre.
enum MatchOutcome { won, lost, draw }

/// Gana quien hizo más goles; si empataron y hubo penales, decide la tanda.
MatchOutcome outcomeOf(CalendarEvent e, {int? shootoutUs, int? shootoutThem}) {
  final us = e.scoreUs ?? 0, them = e.scoreThem ?? 0;
  if (us != them) return us > them ? MatchOutcome.won : MatchOutcome.lost;
  if (shootoutUs != null &&
      shootoutThem != null &&
      shootoutUs != shootoutThem) {
    return shootoutUs > shootoutThem ? MatchOutcome.won : MatchOutcome.lost;
  }
  return MatchOutcome.draw;
}

/// Encabezado de un partido con resultado: «¡GANARON!» con la copa al fondo
/// y confeti, o «PERDIERON.» / «EMPATE.» sin celebración.
class ResultHero extends StatelessWidget {
  const ResultHero({
    super.key,
    required this.event,
    this.shootoutUs,
    this.shootoutThem,
    this.kicker,
  });

  final CalendarEvent event;
  final int? shootoutUs;
  final int? shootoutThem;

  /// «FINAL · FÚTBOL · SUB-10 · 22 NOV.»
  final String? kicker;

  @override
  Widget build(BuildContext context) {
    final outcome = outcomeOf(
      event,
      shootoutUs: shootoutUs,
      shootoutThem: shootoutThem,
    );
    final won = outcome == MatchOutcome.won;
    final title = switch (outcome) {
      MatchOutcome.won => '¡GANARON!',
      MatchOutcome.lost => 'PERDIERON.',
      MatchOutcome.draw => 'EMPATE.',
    };
    final start = event.start;
    final line =
        kicker ??
        [
          'Final',
          ?event.sport?.name,
          if (start != null) GuatemalaTime.shortDate(start),
        ].join(' · ');
    final animate = !(MediaQuery.maybeDisableAnimationsOf(context) ?? false);

    return Container(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: won
              ? const [
                  Color(0xFF2FA65B),
                  PpdColors.greenText,
                  PpdColors.greenDeep,
                ]
              : const [Color(0xFF3A3735), PpdColors.ink, Color(0xFF0E0D0C)],
        ),
      ),
      clipBehavior: Clip.hardEdge,
      child: Stack(
        children: [
          if (won) ...[
            const Positioned(right: -24, top: 18, child: _TrophyShadow()),
            if (animate) const Positioned.fill(child: _Confetti()),
          ],
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 18, 20, 18),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  line.toUpperCase(),
                  style: PpdType.label(color: const Color(0xFFD7F0E0)),
                ),
                const SizedBox(height: 8),
                Semantics(
                  header: true,
                  child: FittedBox(
                    fit: BoxFit.scaleDown,
                    alignment: Alignment.centerLeft,
                    child: Padding(
                      padding: const EdgeInsets.only(right: 10),
                      child: Text(
                        title,
                        style: PpdType.headline(72, color: Colors.white)
                            .copyWith(
                              shadows: const [
                                Shadow(
                                  color: Color(0x40000000),
                                  blurRadius: 18,
                                ),
                              ],
                            ),
                      ),
                    ),
                  ),
                ),
                Container(
                  width: 150,
                  height: 6,
                  margin: const EdgeInsets.only(top: 8),
                  color: PpdColors.gold,
                ),
                const SizedBox(height: 10),
                Center(
                  child: Semantics(
                    label:
                        'Marcador final: ${event.scoreUs} a ${event.scoreThem}',
                    excludeSemantics: true,
                    child: Text.rich(
                      TextSpan(
                        children: [
                          TextSpan(
                            text: '${event.scoreUs}',
                            style: const TextStyle(color: PpdColors.gold),
                          ),
                          TextSpan(
                            text: ' – ',
                            style: TextStyle(
                              color: Colors.white.withValues(alpha: .45),
                              fontSize: 60,
                            ),
                          ),
                          TextSpan(text: '${event.scoreThem}'),
                        ],
                      ),
                      style: PpdType.headline(112, color: Colors.white),
                    ),
                  ),
                ),
                if (shootoutUs != null && shootoutThem != null)
                  Center(
                    child: Text(
                      'Penales $shootoutUs – $shootoutThem',
                      style: const TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.w600,
                      ),
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

/// Copa grande en blanco, desvanecida hacia el fondo.
class _TrophyShadow extends StatelessWidget {
  const _TrophyShadow();

  static const _svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 92 104">'
      '<path d="M20 10h52v8h14c0 18-8 30-22 33-4 9-10 14-16 16v13h14v8H30v-8'
      'h14V67c-6-2-12-7-16-16C14 48 6 36 6 18h14zM20 26H14c1 10 5 17 11 20-3'
      '-6-5-13-5-20zm52 0c0 7-2 14-5 20 6-3 10-10 11-20z" fill="#fff"/>'
      '<rect x="24" y="88" width="44" height="10" rx="2" fill="#fff"/></svg>';

  @override
  Widget build(BuildContext context) => ExcludeSemantics(
    child: Opacity(
      opacity: .24,
      child: ShaderMask(
        blendMode: BlendMode.dstIn,
        shaderCallback: (r) => const RadialGradient(
          radius: .62,
          colors: [Colors.black, Colors.black, Colors.transparent],
          stops: [0, .5, 1],
        ).createShader(r),
        child: SvgPicture.string(_svg, width: 250, height: 283),
      ),
    ),
  );
}

/// Confeti en los colores del logo: cae dos veces y se detiene.
class _Confetti extends StatefulWidget {
  const _Confetti();

  @override
  State<_Confetti> createState() => _ConfettiState();
}

class _ConfettiState extends State<_Confetti>
    with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 3200),
  );
  late final List<_Piece> _pieces;

  @override
  void initState() {
    super.initState();
    final r = math.Random(7);
    const colors = [
      PpdColors.gold,
      Colors.white,
      Color(0xFF8FD3A8),
      Color(0xFF2FB5D9),
      Color(0xFFF8CB6E),
    ];
    _pieces = [
      for (var i = 0; i < 34; i++)
        _Piece(
          x: r.nextDouble(),
          delay: r.nextDouble() * .45,
          size: 5 + r.nextDouble() * 6,
          color: colors[r.nextInt(colors.length)],
          spin: (r.nextDouble() - .5) * 12,
          drift: (r.nextDouble() - .5) * 40,
          round: r.nextDouble() < .3,
        ),
    ];
    _c.repeat(count: 2);
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => IgnorePointer(
    child: ExcludeSemantics(
      child: AnimatedBuilder(
        animation: _c,
        builder: (_, _) => CustomPaint(
          painter: _ConfettiPainter(_pieces, _c.value, _c.isAnimating),
        ),
      ),
    ),
  );
}

class _Piece {
  const _Piece({
    required this.x,
    required this.delay,
    required this.size,
    required this.color,
    required this.spin,
    required this.drift,
    required this.round,
  });

  final double x, delay, size, spin, drift;
  final Color color;
  final bool round;
}

class _ConfettiPainter extends CustomPainter {
  _ConfettiPainter(this.pieces, this.t, this.running);

  final List<_Piece> pieces;
  final double t;
  final bool running;

  @override
  void paint(Canvas canvas, Size size) {
    if (!running) return;
    for (final p in pieces) {
      final local = ((t - p.delay) / (1 - p.delay)).clamp(0.0, 1.0);
      if (local <= 0 || local >= 1) continue;
      final y = -20 + local * (size.height + 40);
      final x = p.x * size.width + p.drift * local;
      final paint = Paint()
        ..color = p.color.withValues(
          alpha: local > .85 ? (1 - local) / .15 : 1,
        );
      canvas.save();
      canvas.translate(x, y);
      canvas.rotate(p.spin * local);
      if (p.round) {
        canvas.drawCircle(Offset.zero, p.size / 2, paint);
      } else {
        canvas.drawRect(
          Rect.fromCenter(
            center: Offset.zero,
            width: p.size,
            height: p.size * 1.6,
          ),
          paint,
        );
      }
      canvas.restore();
    }
  }

  @override
  bool shouldRepaint(_ConfettiPainter old) =>
      old.t != t || old.running != running;
}
