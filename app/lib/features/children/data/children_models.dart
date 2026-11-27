import 'package:freezed_annotation/freezed_annotation.dart';

part 'children_models.freezed.dart';
part 'children_models.g.dart';

/// El dorsal puede venir como número o texto.
String? _asText(Object? value) => value?.toString();

@freezed
abstract class Sport with _$Sport {
  const factory Sport({int? id, required String code, required String name}) =
      _Sport;

  factory Sport.fromJson(Map<String, dynamic> json) => _$SportFromJson(json);
}

@freezed
abstract class NamedRef with _$NamedRef {
  const factory NamedRef({required int id, required String name}) = _NamedRef;

  factory NamedRef.fromJson(Map<String, dynamic> json) =>
      _$NamedRefFromJson(json);
}

/// Colegio o equipo del hijo. La App no usa sus colores: solo nombre y escudo.
@freezed
abstract class ChildOrganization with _$ChildOrganization {
  const factory ChildOrganization({
    required int id,
    required String name,
    String? slug,
    String? logoUrl,
    String? crestUrl,
  }) = _ChildOrganization;

  factory ChildOrganization.fromJson(Map<String, dynamic> json) =>
      _$ChildOrganizationFromJson(json);
}

@freezed
abstract class ChildTeam with _$ChildTeam {
  const factory ChildTeam({
    required int id,
    required String name,
    String? category,
    required Sport sport,
    NamedRef? season,
    @JsonKey(fromJson: _asText) String? jerseyNumber,
    NamedRef? position,
  }) = _ChildTeam;

  factory ChildTeam.fromJson(Map<String, dynamic> json) =>
      _$ChildTeamFromJson(json);
}

@freezed
abstract class Child with _$Child {
  const Child._();

  const factory Child({
    required int id,
    required String firstName,
    @Default('') String lastName,
    String? birthdate,

    /// URL firmada que vence en 15 minutos: no se guarda.
    String? photoUrl,
    required ChildOrganization organization,
    @Default(<ChildTeam>[]) List<ChildTeam> teams,
    String? planLevel,
  }) = _Child;

  factory Child.fromJson(Map<String, dynamic> json) => _$ChildFromJson(json);

  String get fullName => '$firstName $lastName'.trim();

  String get initials {
    final a = firstName.isNotEmpty ? firstName[0] : '';
    final b = lastName.isNotEmpty ? lastName[0] : '';
    return (a + b).toUpperCase();
  }

  /// Deportes del hijo sin repetir, en el orden de sus equipos.
  List<Sport> get sports {
    final seen = <String>{};
    return [
      for (final t in teams)
        if (seen.add(t.sport.code)) t.sport,
    ];
  }

  /// Edad en años cumplidos (null si no hay fecha de nacimiento).
  int? ageOn(DateTime today) {
    final born = birthdate == null ? null : DateTime.tryParse(birthdate!);
    if (born == null) return null;
    var age = today.year - born.year;
    if (today.month < born.month ||
        (today.month == born.month && today.day < born.day)) {
      age--;
    }
    return age;
  }
}
