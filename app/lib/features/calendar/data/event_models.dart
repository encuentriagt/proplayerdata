import 'package:freezed_annotation/freezed_annotation.dart';

import '../../../core/time/guatemala_time.dart';
import '../../children/data/children_models.dart';

part 'event_models.freezed.dart';
part 'event_models.g.dart';

String? _asText(Object? value) => value?.toString();

/// Convocatoria de un hijo: `status` called|reserve, `response` del padre.
@freezed
abstract class Callup with _$Callup {
  const Callup._();

  const factory Callup({required String status, String? response}) = _Callup;

  factory Callup.fromJson(Map<String, dynamic> json) => _$CallupFromJson(json);

  String get statusLabel => status == 'reserve' ? 'Reserva' : 'Convocado';

  String get responseLabel => switch (response) {
    'confirmed' => 'Asistencia confirmada',
    'declined' => 'No asistirá',
    _ => 'Sin respuesta',
  };
}

/// Un hijo dentro de un evento del calendario unificado.
@freezed
abstract class EventChild with _$EventChild {
  const factory EventChild({
    required int childId,
    required String firstName,
    Callup? callup,
  }) = _EventChild;

  factory EventChild.fromJson(Map<String, dynamic> json) =>
      _$EventChildFromJson(json);
}

@freezed
abstract class EventOrganization with _$EventOrganization {
  const factory EventOrganization({required int id, required String name}) =
      _EventOrganization;

  factory EventOrganization.fromJson(Map<String, dynamic> json) =>
      _$EventOrganizationFromJson(json);
}

/// Evento publicado (partido, entreno u otro).
@freezed
abstract class CalendarEvent with _$CalendarEvent {
  const CalendarEvent._();

  const factory CalendarEvent({
    required int id,
    required int teamId,
    String? teamName,
    required String type,
    String? title,
    String? displayTitle,
    String? startsAt,
    String? endsAt,
    String? location,
    String? opponentName,
    String? homeAway,
    @Default('scheduled') String status,
    int? scoreUs,
    int? scoreThem,
    String? resultPublishedAt,
    @JsonKey(fromJson: _asText) String? seriesId,
    NamedRef? team,
    Sport? sport,
    EventOrganization? organization,
    @Default(<EventChild>[]) List<EventChild> children,
  }) = _CalendarEvent;

  factory CalendarEvent.fromJson(Map<String, dynamic> json) =>
      _$CalendarEventFromJson(json);

  bool get isMatch => type == 'match';
  bool get isTraining => type == 'training';
  bool get isCancelled => status == 'cancelled';
  bool get hasResult => scoreUs != null && scoreThem != null;

  String get typeLabel => switch (type) {
    'match' => 'Partido',
    'training' => 'Entreno',
    _ => 'Actividad',
  };

  String get heading =>
      displayTitle ?? title ?? '${team?.name ?? teamName ?? ''} · $typeLabel';

  String? get homeAwayLabel => switch (homeAway) {
    'home' => 'Local',
    'away' => 'Visitante',
    'neutral' => 'Cancha neutral',
    _ => null,
  };

  /// Inicio en hora de Guatemala.
  DateTime? get start =>
      startsAt == null ? null : GuatemalaTime.parse(startsAt!);

  /// Hijos convocados (o en reserva) a este evento.
  List<EventChild> get calledChildren =>
      children.where((c) => c.callup != null).toList();
}

/// Resultado del calendario: eventos + si el plan recortó el pasado.
class CalendarPage {
  const CalendarPage({required this.events, this.historyLimited = false});

  final List<CalendarEvent> events;
  final bool historyLimited;
}

/// Estadística del hijo en un partido.
@freezed
abstract class NamedStat with _$NamedStat {
  const factory NamedStat({
    required String code,
    required String name,
    required int value,
  }) = _NamedStat;

  factory NamedStat.fromJson(Map<String, dynamic> json) =>
      _$NamedStatFromJson(json);
}

@freezed
abstract class Attendance with _$Attendance {
  const Attendance._();

  const factory Attendance({required String status, String? note}) =
      _Attendance;

  factory Attendance.fromJson(Map<String, dynamic> json) =>
      _$AttendanceFromJson(json);

  String get label => attendanceLabel(status);
  bool get isInjury => status == 'injured';
}

String attendanceLabel(String status) => switch (status) {
  'present' => 'Asiste',
  'excused' => 'No asiste (con aviso)',
  'injured' => 'Lesión',
  'absent' => 'No justificado',
  _ => status,
};

@freezed
abstract class ChildPlayed with _$ChildPlayed {
  const factory ChildPlayed({
    @Default(false) bool isStarter,
    int? minutesPlayed,
  }) = _ChildPlayed;

  factory ChildPlayed.fromJson(Map<String, dynamic> json) =>
      _$ChildPlayedFromJson(json);
}

/// Detalle de un evento para un hijo (`children/{id}/events/{eventId}`).
class ChildEventDetail {
  const ChildEventDetail({
    required this.event,
    this.callup,
    this.attendance,
    this.played,
    this.stats,
  });

  final CalendarEvent event;
  final Callup? callup;
  final Attendance? attendance;
  final ChildPlayed? played;

  /// null mientras no se publique la ficha.
  final List<NamedStat>? stats;

  factory ChildEventDetail.fromJson(Map<String, dynamic> json) {
    T? obj<T>(String key, T Function(Map<String, dynamic>) f) =>
        json[key] is Map
        ? f(Map<String, dynamic>.from(json[key] as Map))
        : null;
    final rawStats = json['child_stats'];
    return ChildEventDetail(
      event: CalendarEvent.fromJson(json),
      callup: obj('callup', Callup.fromJson),
      attendance: obj('attendance', Attendance.fromJson),
      played: obj('child_played', ChildPlayed.fromJson),
      stats: rawStats is List
          ? rawStats
                .whereType<Map>()
                .map((e) => NamedStat.fromJson(Map<String, dynamic>.from(e)))
                .toList()
          : null,
    );
  }
}
