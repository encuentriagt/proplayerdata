import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Guarda el token y el último perfil en almacenamiento seguro
/// (Keystore en Android, Keychain en iOS). Nunca en SharedPreferences.
class SessionStorage {
  SessionStorage([FlutterSecureStorage? storage])
    : _storage = storage ?? const FlutterSecureStorage();

  final FlutterSecureStorage _storage;

  static const _tokenKey = 'ppd.token';
  static const _profileKey = 'ppd.profile';

  /// Copia en memoria para no leer el almacenamiento en cada petición.
  String? _token;
  bool _loaded = false;

  Future<String?> readToken() async {
    if (!_loaded) {
      _token = await _storage.read(key: _tokenKey);
      _loaded = true;
    }
    return _token;
  }

  Future<void> writeToken(String token) async {
    _token = token;
    _loaded = true;
    await _storage.write(key: _tokenKey, value: token);
  }

  Future<String?> readProfile() => _storage.read(key: _profileKey);

  Future<void> writeProfile(String json) =>
      _storage.write(key: _profileKey, value: json);

  Future<void> clear() async {
    _token = null;
    _loaded = true;
    await _storage.delete(key: _tokenKey);
    await _storage.delete(key: _profileKey);
  }
}

final sessionStorageProvider = Provider<SessionStorage>(
  (ref) => SessionStorage(),
);
