import 'package:material_ui/material_ui.dart';

import '../theme/brand_colors.dart';

/// Deslizador tipo iOS: hay que arrastrar el círculo hasta el final para
/// confirmar (evita confirmar por un toque accidental). Con lector de
/// pantalla se confirma con un doble toque.
class SlideToConfirm extends StatefulWidget {
  const SlideToConfirm({
    super.key,
    required this.label,
    required this.onConfirmed,
    this.color = PpdColors.error,
  });

  final String label;
  final VoidCallback onConfirmed;

  /// Color de la flecha (el del fondo de la pantalla).
  final Color color;

  @override
  State<SlideToConfirm> createState() => _SlideToConfirmState();
}

class _SlideToConfirmState extends State<SlideToConfirm>
    with SingleTickerProviderStateMixin {
  static const _knob = 54.0;
  static const _pad = 4.0;
  double _x = 0;
  bool _done = false;
  late final AnimationController _back = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 260),
  );
  Animation<double>? _backAnim;

  @override
  void initState() {
    super.initState();
    _back.addListener(() {
      if (_backAnim != null) setState(() => _x = _backAnim!.value);
    });
  }

  @override
  void dispose() {
    _back.dispose();
    super.dispose();
  }

  void _confirm(double max) {
    if (_done) return;
    setState(() {
      _done = true;
      _x = max;
    });
    widget.onConfirmed();
  }

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, box) {
        final max = box.maxWidth - _knob - _pad * 2 - 3;
        final progress = max <= 0 ? 0.0 : (_x / max).clamp(0.0, 1.0);
        return Semantics(
          button: true,
          label: widget.label,
          onTap: () => _confirm(max),
          child: Container(
            height: 64,
            decoration: ShapeDecoration(
              color: Colors.white.withValues(alpha: .16),
              shape: StadiumBorder(
                side: BorderSide(
                  color: Colors.white.withValues(alpha: .35),
                  width: 1.5,
                ),
              ),
            ),
            child: Stack(
              children: [
                Positioned(
                  left: 0,
                  top: 0,
                  bottom: 0,
                  width: _x + _knob + _pad * 2,
                  child: Container(
                    decoration: ShapeDecoration(
                      color: Colors.white.withValues(alpha: .22),
                      shape: const StadiumBorder(),
                    ),
                  ),
                ),
                Positioned.fill(
                  child: ExcludeSemantics(
                    child: Opacity(
                      opacity: (1 - progress / .6).clamp(0.0, 1.0),
                      child: Padding(
                        padding: const EdgeInsets.only(left: 48),
                        child: Center(
                          child: Text(
                            widget.label,
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 17,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
                Positioned(
                  left: _pad + _x,
                  top: _pad - 1,
                  child: GestureDetector(
                    onHorizontalDragStart: (_) => _back.stop(),
                    onHorizontalDragUpdate: (d) {
                      if (_done) return;
                      setState(() => _x = (_x + d.delta.dx).clamp(0.0, max));
                    },
                    onHorizontalDragEnd: (_) {
                      if (_done) return;
                      if (_x >= max * .85) {
                        _confirm(max);
                      } else {
                        _backAnim = Tween(begin: _x, end: 0.0).animate(
                          CurvedAnimation(
                            parent: _back,
                            curve: Curves.easeOutCubic,
                          ),
                        );
                        _back.forward(from: 0);
                      }
                    },
                    child: Container(
                      width: _knob,
                      height: _knob,
                      decoration: const BoxDecoration(
                        color: Colors.white,
                        shape: BoxShape.circle,
                        boxShadow: [
                          BoxShadow(
                            color: Color(0x40000000),
                            blurRadius: 14,
                            offset: Offset(0, 4),
                          ),
                        ],
                      ),
                      child: Icon(
                        _done ? Icons.check : Icons.arrow_forward,
                        color: widget.color,
                        size: 26,
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}
