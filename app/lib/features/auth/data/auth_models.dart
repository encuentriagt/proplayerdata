import 'package:freezed_annotation/freezed_annotation.dart';

import '../../../core/models/organization.dart';

part 'auth_models.freezed.dart';
part 'auth_models.g.dart';

@freezed
abstract class AuthUser with _$AuthUser {
  const factory AuthUser({
    required int id,
    required String name,
    required String email,
    @Default(false) bool mustChangePassword,
    @Default(false) bool isSuperAdmin,
  }) = _AuthUser;

  factory AuthUser.fromJson(Map<String, dynamic> json) =>
      _$AuthUserFromJson(json);
}

@freezed
abstract class Membership with _$Membership {
  const factory Membership({
    required int organizationId,
    required String role,
    String? roleLabel,
    Organization? organization,
  }) = _Membership;

  factory Membership.fromJson(Map<String, dynamic> json) =>
      _$MembershipFromJson(json);
}

/// Perfil de la sesión (`/auth/me` y la parte común del login).
@freezed
abstract class SessionProfile with _$SessionProfile {
  const SessionProfile._();

  const factory SessionProfile({
    required AuthUser user,
    @Default(false) bool isGuardian,
    @Default(<Membership>[]) List<Membership> memberships,
  }) = _SessionProfile;

  factory SessionProfile.fromJson(Map<String, dynamic> json) =>
      _$SessionProfileFromJson(json);

  bool get mustChangePassword => user.mustChangePassword;
}

/// Respuesta del login: token + perfil.
class LoginResult {
  const LoginResult({
    required this.token,
    required this.profile,
    this.expiresAt,
  });

  final String token;
  final DateTime? expiresAt;
  final SessionProfile profile;

  factory LoginResult.fromJson(Map<String, dynamic> json) => LoginResult(
    token: json['token'] as String,
    expiresAt: json['expires_at'] == null
        ? null
        : DateTime.tryParse(json['expires_at'] as String),
    profile: SessionProfile.fromJson(json),
  );
}
