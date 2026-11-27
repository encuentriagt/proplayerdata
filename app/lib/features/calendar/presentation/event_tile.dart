import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';

import '../../../core/theme/brand_colors.dart';
import '../../../core/time/guatemala_time.dart';
import '../../../core/widgets/sport_icon.dart';
import '../data/event_models.dart';

/// Color por tipo de actividad.
Color eventColor(CalendarEvent e) {
  if (e.isCancelled) return PpdColors.muted;
  if (e.isMatch) return PpdColors.green;
  if (e.isTraining) return PpdColors.cyan;
  return PpdColors.star;
}

/// Abre el detalle del evento con los hijos convocados.
void openEvent(BuildContext context, CalendarEvent e) {
  final ids = e.calledChildren.map((c) => c.childId).join(',');
  context.push('/eventos/${e.id}?hijos=$ids', extra: e);
}

/// Fila de un evento en el calendario.
class EventTile extends StatelessWidget {
  const EventTile({super.key, required this.event});

  final CalendarEvent event;

  @override
  Widget build(BuildContext context) {
    final e = event;
    final text = Theme.of(context).textTheme;
    final start = e.start;
    final names = e.calledChildren.map((c) => c.firstName).join(', ');
    final where = [
      e.organization?.name,
      e.sport?.name,
      e.team?.name ?? e.teamName,
    ].whereType<String>().join(' · ');

    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: () => openEvent(context, e),
        child: IntrinsicHeight(
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Container(width: 6, color: eventColor(e)),
              SizedBox(
                width: 72,
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: 12),
                  child: Column(
                    children: [
                      Text(
                        start == null ? '--' : GuatemalaTime.time(start),
                        style: text.titleSmall?.copyWith(
                          fontWeight: FontWeight.w700,
                        ),
                        textAlign: TextAlign.center,
                      ),
                      const SizedBox(height: 6),
                      Icon(
                        sportIcon(e.sport?.code ?? ''),
                        size: 20,
                        color: PpdColors.muted,
                      ),
                    ],
                  ),
                ),
              ),
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(0, 12, 12, 12),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          _TypeChip(event: e),
                          if (e.isCancelled) ...[
                            const SizedBox(width: 6),
                            const _Pill(
                              text: 'Cancelado',
                              color: PpdColors.error,
                              background: PpdColors.errorBg,
                            ),
                          ],
                        ],
                      ),
                      const SizedBox(height: 4),
                      Text(
                        e.heading,
                        style: text.titleSmall?.copyWith(
                          fontWeight: FontWeight.w700,
                          decoration: e.isCancelled
                              ? TextDecoration.lineThrough
                              : null,
                        ),
                      ),
                      if (e.hasResult)
                        Text(
                          'Resultado: ${e.scoreUs} – ${e.scoreThem}',
                          style: text.bodyMedium?.copyWith(
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      if (where.isNotEmpty)
                        Text(
                          where,
                          style: text.bodySmall?.copyWith(
                            color: PpdColors.muted,
                          ),
                        ),
                      if (names.isNotEmpty)
                        Padding(
                          padding: const EdgeInsets.only(top: 4),
                          child: Row(
                            children: [
                              const Icon(
                                Icons.person_outline,
                                size: 16,
                                color: PpdColors.muted,
                              ),
                              const SizedBox(width: 4),
                              Expanded(
                                child: Text(names, style: text.bodySmall),
                              ),
                            ],
                          ),
                        ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _TypeChip extends StatelessWidget {
  const _TypeChip({required this.event});

  final CalendarEvent event;

  @override
  Widget build(BuildContext context) {
    final color = eventColor(event);
    return _Pill(
      text: event.typeLabel,
      color: color,
      background: color.withValues(alpha: 0.12),
    );
  }
}

class _Pill extends StatelessWidget {
  const _Pill({
    required this.text,
    required this.color,
    required this.background,
  });

  final String text;
  final Color color;
  final Color background;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
        color: background,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        text,
        style: TextStyle(
          color: color,
          fontSize: 12,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }
}
