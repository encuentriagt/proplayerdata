import 'package:freezed_annotation/freezed_annotation.dart';

part 'organization.freezed.dart';
part 'organization.g.dart';

/// Colegio o equipo tal como lo manda la API. La App no usa marca blanca:
/// de la organización solo se muestra el nombre.
@freezed
abstract class Organization with _$Organization {
  const factory Organization({int? id, required String name, String? slug}) =
      _Organization;

  factory Organization.fromJson(Map<String, dynamic> json) =>
      _$OrganizationFromJson(json);
}
