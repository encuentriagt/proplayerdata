import 'package:app/features/auth/data/google_auth.dart';
import 'package:flutter_riverpod/misc.dart';

/// Google simulado: devuelve [token] (null = el usuario canceló).
class FakeGoogleAuth extends GoogleAuth {
  FakeGoogleAuth({this.token = 'google-id-token', this.isAvailable = true});

  final String? token;
  final bool isAvailable;
  int signOuts = 0;

  @override
  bool get available => isAvailable;

  @override
  Future<String?> idToken() async => token;

  @override
  Future<void> signOut() async => signOuts++;

  Override get providerOverride => googleAuthProvider.overrideWithValue(this);
}
