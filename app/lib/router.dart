import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'features/auth/application/session_controller.dart';
import 'features/auth/presentation/change_password_screen.dart';
import 'features/auth/presentation/forgot_password_screen.dart';
import 'features/auth/presentation/login_screen.dart';
import 'features/auth/presentation/not_guardian_screen.dart';
import 'features/auth/presentation/splash_screen.dart';
import 'features/home/home_screen.dart';

abstract final class Routes {
  static const splash = '/cargando';
  static const login = '/ingresar';
  static const forgot = '/olvide-contrasena';
  static const mustChange = '/cambiar-contrasena';
  static const notGuardian = '/solo-padres';
  static const home = '/';
  static const changePassword = '/contrasena';
}

/// Decide a dónde ir según la sesión. Devuelve null si puede quedarse.
@visibleForTesting
String? redirectFor(SessionState session, String location) {
  const public = {Routes.login, Routes.forgot};
  switch (session) {
    case SessionLoading():
      return location == Routes.splash ? null : Routes.splash;
    case SignedOut():
      return public.contains(location) ? null : Routes.login;
    case SignedIn(:final profile):
      if (profile.mustChangePassword) {
        return location == Routes.mustChange ? null : Routes.mustChange;
      }
      if (!profile.isGuardian) {
        return location == Routes.notGuardian ? null : Routes.notGuardian;
      }
      const blocked = {
        Routes.splash,
        Routes.login,
        Routes.forgot,
        Routes.mustChange,
        Routes.notGuardian,
      };
      return blocked.contains(location) ? Routes.home : null;
  }
}

final routerProvider = Provider<GoRouter>((ref) {
  final refresh = ValueNotifier<SessionState>(
    ref.read(sessionControllerProvider),
  );
  ref.listen(sessionControllerProvider, (_, next) => refresh.value = next);
  ref.onDispose(refresh.dispose);

  final router = GoRouter(
    initialLocation: Routes.splash,
    refreshListenable: refresh,
    redirect: (_, state) => redirectFor(refresh.value, state.matchedLocation),
    routes: [
      GoRoute(path: Routes.splash, builder: (_, _) => const SplashScreen()),
      GoRoute(path: Routes.login, builder: (_, _) => const LoginScreen()),
      GoRoute(
        path: Routes.forgot,
        builder: (_, _) => const ForgotPasswordScreen(),
      ),
      GoRoute(
        path: Routes.mustChange,
        builder: (_, _) => const ChangePasswordScreen(mandatory: true),
      ),
      GoRoute(
        path: Routes.notGuardian,
        builder: (_, _) => const NotGuardianScreen(),
      ),
      GoRoute(path: Routes.home, builder: (_, _) => const HomeScreen()),
      GoRoute(
        path: Routes.changePassword,
        builder: (_, _) => const ChangePasswordScreen(),
      ),
    ],
  );
  ref.onDispose(router.dispose);
  return router;
});
