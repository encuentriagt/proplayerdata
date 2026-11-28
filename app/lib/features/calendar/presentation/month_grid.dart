import 'package:intl/intl.dart';
import 'package:material_ui/material_ui.dart';

import '../../../core/theme/brand_colors.dart';

bool sameDay(DateTime a, DateTime b) =>
    a.year == b.year && a.month == b.month && a.day == b.day;

/// Calendario de un mes (lunes a domingo) con puntos de color por día.
class MonthGrid extends StatelessWidget {
  const MonthGrid({
    super.key,
    required this.month,
    required this.selected,
    required this.today,
    required this.markers,
    required this.onSelect,
    required this.onMonthChange,
  });

  /// Primer día del mes que se muestra.
  final DateTime month;
  final DateTime selected;
  final DateTime today;

  /// Colores de los puntos de cada día (máx. 3).
  final List<Color> Function(DateTime day) markers;
  final ValueChanged<DateTime> onSelect;

  /// -1 mes anterior, +1 mes siguiente.
  final ValueChanged<int> onMonthChange;

  static const _weekdays = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final title = DateFormat('MMMM y', 'es').format(month);
    final first = DateTime(month.year, month.month);
    final daysInMonth = DateTime(month.year, month.month + 1, 0).day;
    final lead = first.weekday - 1; // lunes = 0
    final cells = ((lead + daysInMonth) / 7).ceil() * 7;

    return Padding(
      padding: const EdgeInsets.fromLTRB(8, 4, 8, 12),
      child: Column(
        children: [
          Row(
            children: [
              IconButton(
                tooltip: 'Mes anterior',
                onPressed: () => onMonthChange(-1),
                icon: const Icon(Icons.chevron_left),
              ),
              Expanded(
                child: Text(
                  '${title[0].toUpperCase()}${title.substring(1)}',
                  textAlign: TextAlign.center,
                  style: text.titleMedium?.copyWith(
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
              IconButton(
                tooltip: 'Mes siguiente',
                onPressed: () => onMonthChange(1),
                icon: const Icon(Icons.chevron_right),
              ),
            ],
          ),
          Row(
            children: [
              for (final w in _weekdays)
                Expanded(
                  child: Text(
                    w,
                    textAlign: TextAlign.center,
                    style: text.labelSmall?.copyWith(color: PpdColors.muted),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 4),
          for (var row = 0; row < cells ~/ 7; row++)
            Row(
              children: [
                for (var col = 0; col < 7; col++)
                  Expanded(
                    child: _dayCell(
                      context,
                      row * 7 + col - lead + 1,
                      daysInMonth,
                    ),
                  ),
              ],
            ),
        ],
      ),
    );
  }

  Widget _dayCell(BuildContext context, int dayNumber, int daysInMonth) {
    if (dayNumber < 1 || dayNumber > daysInMonth) {
      return const SizedBox(height: 46);
    }
    final day = DateTime(month.year, month.month, dayNumber);
    final isSelected = sameDay(day, selected);
    final isToday = sameDay(day, today);
    final dots = markers(day);
    final label = DateFormat("EEEE d 'de' MMMM", 'es').format(day);

    return Semantics(
      button: true,
      selected: isSelected,
      label: dots.isEmpty
          ? label
          : '$label, ${dots.length == 1 ? '1 actividad' : '${dots.length} actividades'}',
      child: InkWell(
        customBorder: const CircleBorder(),
        onTap: () => onSelect(day),
        child: SizedBox(
          height: 46,
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Container(
                width: 32,
                height: 32,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: isSelected
                      ? PpdColors.ink
                      : isToday
                      ? PpdColors.star.withValues(alpha: 0.35)
                      : null,
                ),
                child: ExcludeSemantics(
                  child: Text(
                    '$dayNumber',
                    style: TextStyle(
                      color: isSelected ? PpdColors.onInk : PpdColors.ink,
                      fontWeight: isToday || isSelected
                          ? FontWeight.w700
                          : FontWeight.w400,
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 2),
              SizedBox(
                height: 6,
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    for (final c in dots.take(3))
                      Container(
                        width: 6,
                        height: 6,
                        margin: const EdgeInsets.symmetric(horizontal: 1),
                        decoration: BoxDecoration(
                          color: c,
                          shape: BoxShape.circle,
                        ),
                      ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
