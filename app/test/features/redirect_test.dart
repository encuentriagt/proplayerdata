import 'package:app/features/auth/application/session_controller.dart';
import 'package:app/features/auth/data/auth_models.dart';
import 'package:app/router.dart';
import 'package:flutter_test/flutter_test.dart';

SessionProfile profile({bool mustChange = false, bool mustVerify = false}) =>
    SessionProfile(
      user: AuthUser(
        id: 1,
        name: 'Marta',
        email: 'm@example.com',
        mustChangePassword: mustChange,
        emailVerified: !mustVerify,
      ),
      mustVerifyEmail: mustVerify,
    );

void main() {
  test('cargando: siempre a la pantalla de carga', () {
    expect(redirectFor(const SessionLoading(), Routes.home), Routes.splash);
    expect(redirectFor(const SessionLoading(), Routes.splash), isNull);
  });

  test('sin sesión: login, crear cuenta y recuperar contraseña', () {
    expect(redirectFor(const SignedOut(), Routes.home), Routes.login);
    expect(redirectFor(const SignedOut(), Routes.forgot), isNull);
    expect(redirectFor(const SignedOut(), Routes.register), isNull);
  });

  test('correo sin verificar: obligatorio verificarlo', () {
    final s = SignedIn(profile(mustVerify: true));
    expect(redirectFor(s, Routes.home), Routes.verifyEmail);
    expect(redirectFor(s, Routes.verifyEmail), isNull);
  });

  test('contraseña temporal: obligatorio cambiarla', () {
    final s = SignedIn(profile(mustChange: true));
    expect(redirectFor(s, Routes.home), Routes.mustChange);
    expect(redirectFor(s, Routes.mustChange), isNull);
  });

  test('padre verificado: entra al inicio y no vuelve al login', () {
    final s = SignedIn(profile());
    expect(redirectFor(s, Routes.login), Routes.home);
    expect(redirectFor(s, Routes.register), Routes.home);
    expect(redirectFor(s, Routes.verifyEmail), Routes.home);
    expect(redirectFor(s, Routes.home), isNull);
    expect(redirectFor(s, Routes.changePassword), isNull);
  });
}
