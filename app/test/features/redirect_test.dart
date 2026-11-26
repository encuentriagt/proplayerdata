import 'package:app/features/auth/application/session_controller.dart';
import 'package:app/features/auth/data/auth_models.dart';
import 'package:app/router.dart';
import 'package:flutter_test/flutter_test.dart';

SessionProfile profile({bool mustChange = false, bool guardian = true}) =>
    SessionProfile(
      user: AuthUser(
        id: 1,
        name: 'Marta',
        email: 'm@example.com',
        mustChangePassword: mustChange,
      ),
      isGuardian: guardian,
    );

void main() {
  test('cargando: siempre a la pantalla de carga', () {
    expect(redirectFor(const SessionLoading(), Routes.home), Routes.splash);
    expect(redirectFor(const SessionLoading(), Routes.splash), isNull);
  });

  test('sin sesión: solo login y recuperar contraseña', () {
    expect(redirectFor(const SignedOut(), Routes.home), Routes.login);
    expect(redirectFor(const SignedOut(), Routes.forgot), isNull);
  });

  test('contraseña temporal: obligatorio cambiarla', () {
    final s = SignedIn(profile(mustChange: true));
    expect(redirectFor(s, Routes.home), Routes.mustChange);
    expect(redirectFor(s, Routes.mustChange), isNull);
  });

  test('quien no es padre ve el aviso', () {
    final s = SignedIn(profile(guardian: false));
    expect(redirectFor(s, Routes.home), Routes.notGuardian);
  });

  test('padre: entra al inicio y no vuelve al login', () {
    final s = SignedIn(profile());
    expect(redirectFor(s, Routes.login), Routes.home);
    expect(redirectFor(s, Routes.home), isNull);
    expect(redirectFor(s, Routes.changePassword), isNull);
  });
}
