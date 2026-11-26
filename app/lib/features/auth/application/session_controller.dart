import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/api_client.dart';
import '../../../core/network/api_exception.dart';
import '../../../core/storage/session_storage.dart';
import '../data/auth_models.dart';
import '../data/auth_repository.dart';

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
    events.onPasswordChangeRequired = _handlePasswordChangeRequired;
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
    await _storage.writeProfile(jsonEncode(profile.toJson()));
    state = SignedIn(profile);
  }

  /// Lanza [ApiException] para que la pantalla muestre el error.
  Future<void> login({required String email, required String password}) async {
    final result = await _repo.login(email: email, password: password);
    await _storage.writeToken(result.token);
    await _storage.writeProfile(jsonEncode(result.profile.toJson()));
    state = SignedIn(result.profile);
  }

  /// Tras cambiar la contraseña: la API ya no exige el cambio.
  Future<void> passwordChanged() async {
    final current = state;
    if (current is SignedIn) {
      final profile = current.profile.copyWith(
        user: current.profile.user.copyWith(mustChangePassword: false),
      );
      await _storage.writeProfile(jsonEncode(profile.toJson()));
      state = SignedIn(profile);
    }
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
    await _signOutLocally();
  }

  Future<void> _signOutLocally({String? notice}) async {
    await _storage.clear();
    state = SignedOut(notice: notice);
  }

  void _handleUnauthorized() {
    if (state is SignedIn) {
      _signOutLocally(notice: expiredNotice);
    }
  }

  void _handlePasswordChangeRequired() {
    final current = state;
    if (current is SignedIn && !current.profile.mustChangePassword) {
      state = SignedIn(
        current.profile.copyWith(
          user: current.profile.user.copyWith(mustChangePassword: true),
        ),
      );
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
