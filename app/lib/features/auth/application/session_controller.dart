import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/api_client.dart';
import '../../../core/network/api_exception.dart';
import '../../../core/network/idempotency.dart';
import '../../../core/storage/session_storage.dart';
import '../data/auth_models.dart';
import '../data/auth_repository.dart';
import '../data/google_auth.dart';

sealed class SessionState {
  const SessionState();
}

/// Revisando si hay una sesión guardada.
class SessionLoading extends SessionState {
  const SessionLoading();
}

class SignedOut extends SessionState {
  const SignedOut({this.notice});

  /// Mensaje para mostrar en el login (p. ej. sesión vencida).
  final String? notice;
}

class SignedIn extends SessionState {
  const SignedIn(this.profile);

  final SessionProfile profile;
}

class SessionController extends Notifier<SessionState> {
  static const expiredNotice = 'Su sesión venció. Inicie sesión de nuevo.';

  SessionStorage get _storage => ref.read(sessionStorageProvider);
  AuthRepository get _repo => ref.read(authRepositoryProvider);

  @override
  SessionState build() {
    final events = ref.read(apiEventsProvider);
    events.onUnauthorized = _handleUnauthorized;
    events.onPasswordChangeRequired = () =>
        _patchUser((u) => u.copyWith(mustChangePassword: true));
    events.onEmailUnverified = () => _patch(
      (p) => p.mustVerifyEmail ? p : p.copyWith(mustVerifyEmail: true),
    );
    Future.microtask(restore);
    return const SessionLoading();
  }

  /// Al abrir la App: usa el perfil guardado y lo refresca en segundo plano.
  Future<void> restore() async {
    final token = await _storage.readToken();
    if (token == null) {
      state = const SignedOut();
      return;
    }
    final cached = await _readCachedProfile();
    if (cached != null) state = SignedIn(cached);
    try {
      await refreshProfile();
    } on ApiException catch (e) {
      // Sin conexión: se queda con lo guardado. 401 ya cerró la sesión.
      if (cached == null && state is SessionLoading) {
        state = SignedOut(notice: e.isNetwork ? e.message : null);
      }
    }
  }

  Future<void> refreshProfile() async {
    final profile = await _repo.me();
    await _save(profile);
  }

  /// Lanza [ApiException] para que la pantalla muestre el error.
  Future<void> login({required String email, required String password}) async {
    await _signIn(await _repo.login(email: email, password: password));
  }

  Future<void> register({
    required String name,
    required String email,
    String? phone,
    required String password,
    required String passwordConfirmation,
    required IdempotencyKey key,
  }) async {
    await _signIn(
      await _repo.register(
        name: name,
        email: email,
        phone: phone,
        password: password,
        passwordConfirmation: passwordConfirmation,
        key: key,
      ),
    );
  }

  /// «Continuar con Google». Devuelve false si el usuario canceló.
  /// Lanza [GoogleAuthException] o [ApiException].
  Future<bool> continueWithGoogle() async {
    final idToken = await ref.read(googleAuthProvider).idToken();
    if (idToken == null) return false;
    await _signIn(
      await _repo.social(provider: SocialProvider.google, idToken: idToken),
    );
    return true;
  }

  /// Tras ingresar el código correcto.
  Future<void> emailVerified() async {
    _patch(
      (p) => p.copyWith(
        mustVerifyEmail: false,
        user: p.user.copyWith(emailVerified: true),
      ),
    );
    await _persistCurrent();
    try {
      await refreshProfile();
    } on ApiException {
      // Se queda con el perfil local; se refresca al volver a abrir.
    }
  }

  /// Tras cambiar la contraseña: la API ya no exige el cambio.
  Future<void> passwordChanged() async {
    _patchUser((u) => u.copyWith(mustChangePassword: false));
    await _persistCurrent();
    try {
      await refreshProfile();
    } on ApiException {
      // Se queda con el perfil local; se refresca al volver a abrir.
    }
  }

  Future<void> logout() async {
    try {
      await _repo.logout();
    } on ApiException {
      // Aunque falle la red, la sesión local se cierra.
    }
    await ref.read(googleAuthProvider).signOut();
    await _signOutLocally();
  }

  Future<void> _signIn(LoginResult result) async {
    await _storage.writeToken(result.token);
    await _save(result.profile);
  }

  Future<void> _save(SessionProfile profile) async {
    await _storage.writeProfile(jsonEncode(profile.toJson()));
    state = SignedIn(profile);
  }

  Future<void> _persistCurrent() async {
    final current = state;
    if (current is SignedIn) {
      await _storage.writeProfile(jsonEncode(current.profile.toJson()));
    }
  }

  void _patch(SessionProfile Function(SessionProfile) change) {
    final current = state;
    if (current is SignedIn) {
      final next = change(current.profile);
      if (next != current.profile) state = SignedIn(next);
    }
  }

  void _patchUser(AuthUser Function(AuthUser) change) =>
      _patch((p) => p.copyWith(user: change(p.user)));

  Future<void> _signOutLocally({String? notice}) async {
    await _storage.clear();
    state = SignedOut(notice: notice);
  }

  void _handleUnauthorized() {
    if (state is SignedIn) {
      _signOutLocally(notice: expiredNotice);
    }
  }

  Future<SessionProfile?> _readCachedProfile() async {
    final raw = await _storage.readProfile();
    if (raw == null) return null;
    try {
      return SessionProfile.fromJson(jsonDecode(raw) as Map<String, dynamic>);
    } catch (_) {
      return null;
    }
  }
}

final sessionControllerProvider =
    NotifierProvider<SessionController, SessionState>(SessionController.new);
