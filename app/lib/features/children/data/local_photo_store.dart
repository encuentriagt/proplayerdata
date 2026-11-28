import 'dart:io';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:path_provider/path_provider.dart';

/// Fotos de los hijos que el padre pone en la App. **Solo en el teléfono**:
/// nunca se suben al servidor. Se borran al cerrar sesión.
class LocalPhotoStore {
  Future<Directory> _root() async {
    final base = await getApplicationSupportDirectory();
    return Directory('${base.path}/child_photos');
  }

  Future<Directory> _userDir(int userId) async =>
      Directory('${(await _root()).path}/u$userId');

  /// Fotos guardadas de la cuenta: id del hijo → ruta del archivo.
  Future<Map<int, String>> load(int userId) async {
    final dir = await _userDir(userId);
    if (!dir.existsSync()) return {};
    final result = <int, String>{};
    for (final f in dir.listSync().whereType<File>()) {
      final name = f.uri.pathSegments.last; // {childId}_{marca}.jpg
      final id = int.tryParse(name.split('_').first);
      if (id != null) result[id] = f.path;
    }
    return result;
  }

  /// Copia la imagen elegida y borra la anterior de ese hijo.
  Future<String> save(int userId, int childId, String sourcePath) async {
    final dir = await _userDir(userId);
    await dir.create(recursive: true);
    await remove(userId, childId);
    final stamp = DateTime.now().millisecondsSinceEpoch;
    final target = '${dir.path}/${childId}_$stamp.jpg';
    await File(sourcePath).copy(target);
    return target;
  }

  Future<void> remove(int userId, int childId) async {
    final dir = await _userDir(userId);
    if (!dir.existsSync()) return;
    for (final f in dir.listSync().whereType<File>()) {
      if (f.uri.pathSegments.last.startsWith('${childId}_')) {
        await f.delete();
      }
    }
  }

  /// Al cerrar sesión o eliminar la cuenta.
  Future<void> clearAll() async {
    final root = await _root();
    if (root.existsSync()) await root.delete(recursive: true);
  }
}

final localPhotoStoreProvider = Provider<LocalPhotoStore>(
  (ref) => LocalPhotoStore(),
);
