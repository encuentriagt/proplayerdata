import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_sign_in/google_sign_in.dart';

import '../../../core/config/env.dart';

/// Falla de Google que se muestra al usuario.
class GoogleAuthException implements Exception {
  const GoogleAuthException(this.message);
  final String message;
}

/// «Continuar con Google»: obtiene el ID token que se manda a la API.
class GoogleAuth {
  bool _initialized = false;

  /// El botón solo aparece si hay web client ID configurado.
  bool get available => Env.googleServerClientId.isNotEmpty;

  /// Devuelve el ID token, o null si el usuario canceló.
  Future<String?> idToken() async {
    try {
      if (!_initialized) {
        await GoogleSignIn.instance.initialize(
          serverClientId: Env.googleServerClientId,
        );
        _initialized = true;
      }
      final account = await GoogleSignIn.instance.authenticate();
      final token = account.authentication.idToken;
      if (token == null) {
        throw const GoogleAuthException(
          'Google no entregó los datos de la cuenta. Intente de nuevo.',
        );
      }
      return token;
    } on GoogleSignInException catch (e) {
      if (e.code == GoogleSignInExceptionCode.canceled ||
          e.code == GoogleSignInExceptionCode.interrupted) {
        return null;
      }
      throw const GoogleAuthException(
        'No se pudo continuar con Google. Intente de nuevo o use su correo.',
      );
    }
  }

  /// Al cerrar sesión, para que la próxima vez se pueda elegir otra cuenta.
  Future<void> signOut() async {
    if (!_initialized) return;
    try {
      await GoogleSignIn.instance.signOut();
    } catch (_) {
      // No impide cerrar la sesión de la App.
    }
  }
}

final googleAuthProvider = Provider<GoogleAuth>((ref) => GoogleAuth());
