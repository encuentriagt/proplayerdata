import '../../calendar/data/event_models.dart';
import '../../children/data/children_models.dart';

/// Un hijo en un equipo de ese deporte.
class SportEntry {
  const SportEntry({required this.child, required this.team});

  final Child child;
  final ChildTeam team;
}

/// Un deporte con todos los hijos que lo juegan (de cualquier colegio).
class SportSummary {
  const SportSummary({required this.sport, required this.entries});

  final Sport sport;
  final List<SportEntry> entries;

  /// Hijos sin repetir (un hijo puede estar en dos equipos del deporte).
  List<Child> get children {
    final seen = <int>{};
    return [
      for (final e in entries)
        if (seen.add(e.child.id)) e.child,
    ];
  }

  Set<int> get teamIds => {for (final e in entries) e.team.id};
}

/// Todos los deportes de todos los hijos, en el orden en que aparecen.
List<SportSummary> buildSportSummaries(List<Child> children) {
  final order = <String>[];
  final sports = <String, Sport>{};
  final entries = <String, List<SportEntry>>{};
  for (final child in children) {
    for (final team in child.teams) {
      final code = team.sport.code;
      if (!sports.containsKey(code)) {
        order.add(code);
        sports[code] = team.sport;
      }
      (entries[code] ??= []).add(SportEntry(child: child, team: team));
    }
  }
  return [
    for (final code in order)
      SportSummary(sport: sports[code]!, entries: entries[code]!),
  ];
}

/// Totales de un hijo en un deporte (partidos con ficha publicada).
class SportStats {
  const SportStats({
    required this.sportId,
    required this.matches,
    required this.minutes,
    required this.stats,
  });

  final int sportId;
  final int matches;
  final int minutes;
  final List<NamedStat> stats;

  factory SportStats.fromJson(Map<String, dynamic> json) => SportStats(
    sportId: (json['sport_id'] as num).toInt(),
    matches: (json['matches'] as num?)?.toInt() ?? 0,
    minutes: (json['minutes'] as num?)?.toInt() ?? 0,
    stats: [
      for (final s in (json['stats'] as List? ?? const []))
        if (s is Map) NamedStat.fromJson(Map<String, dynamic>.from(s)),
    ],
  );
}

/// `children/{id}/stats`: totales por deporte y asistencia.
class ChildStats {
  const ChildStats({
    required this.bySport,
    required this.attendance,
    this.limited = false,
  });

  final List<SportStats> bySport;

  /// present, excused, injured, absent, late → cantidad.
  final Map<String, int> attendance;

  /// Plan gratis: solo los últimos partidos.
  final bool limited;

  SportStats? forSport(int? sportId) {
    for (final s in bySport) {
      if (s.sportId == sportId) return s;
    }
    return null;
  }

  factory ChildStats.fromJson(Map<String, dynamic> data, Map meta) =>
      ChildStats(
        bySport: [
          for (final s in (data['by_sport'] as List? ?? const []))
            if (s is Map) SportStats.fromJson(Map<String, dynamic>.from(s)),
        ],
        attendance: {
          if (data['attendance'] is Map)
            for (final e in (data['attendance'] as Map).entries)
              '${e.key}': (e.value as num?)?.toInt() ?? 0,
        },
        limited: meta['limited'] == true,
      );
}
