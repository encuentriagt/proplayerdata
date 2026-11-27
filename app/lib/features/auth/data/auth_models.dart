import 'package:freezed_annotation/freezed_annotation.dart';

part 'auth_models.freezed.dart';
part 'auth_models.g.dart';

/// Cuenta de padre (la App es solo para padres; el staff no entra).
@freezed
abstract class AuthUser with _$AuthUser {
  const factory AuthUser({
    required int id,
    required String name,
    required String email,
    String? phone,
    @Default(false) bool mustChangePassword,
    @Default(false) bool emailVerified,

    /// false = cuenta creada con Google o Apple (sin contraseña propia).
    @Default(true) bool passwordSet,

    /// Proveedores vinculados: `google`, `apple`.
    @Default(<String>[]) List<String> linked,
  }) = _AuthUser;

  factory AuthUser.fromJson(Map<String, dynamic> json) =>
      _$AuthUserFromJson(json);
}

/// Perfil de la sesión (`/auth/me` y la parte común del login).
@freezed
abstract class SessionProfile with _$SessionProfile {
  const SessionProfile._();

  const factory SessionProfile({
    required AuthUser user,

    /// Padre que todavía no verificó su correo con el código.
    @Default(false) bool mustVerifyEmail,
  }) = _SessionProfile;

  factory SessionProfile.fromJson(Map<String, dynamic> json) =>
      _$SessionProfileFromJson(json);

  bool get mustChangePassword => user.mustChangePassword;
}

/// Respuesta del login, del registro y de Google/Apple: token + perfil.
class LoginResult {
  const LoginResult({
    required this.token,
    required this.profile,
    this.expiresAt,
    this.created = false,
  });

  final String token;
  final DateTime? expiresAt;
  final SessionProfile profile;

  /// Solo en Google/Apple: true si la cuenta se acaba de crear.
  final bool created;

  factory LoginResult.fromJson(Map<String, dynamic> json) => LoginResult(
    token: json['token'] as String,
    expiresAt: json['expires_at'] == null
        ? null
        : DateTime.tryParse(json['expires_at'] as String),
    profile: SessionProfile.fromJson(json),
    created: json['created'] == true,
  );
}
