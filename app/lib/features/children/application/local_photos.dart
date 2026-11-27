import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';

import '../data/local_photo_store.dart';
import 'children_providers.dart';

/// Fotos locales de los hijos de la cuenta actual (id del hijo → archivo).
class LocalPhotos extends Notifier<Map<int, String>> {
  LocalPhotoStore get _store => ref.read(localPhotoStoreProvider);
  int? get _userId => ref.read(currentUserIdProvider);

  @override
  Map<int, String> build() {
    final userId = ref.watch(currentUserIdProvider);
    if (userId != null) _load(userId);
    return const {};
  }

  Future<void> _load(int userId) async {
    try {
      final photos = await _store.load(userId);
      if (ref.mounted && _userId == userId) state = photos;
    } catch (_) {
      // Sin acceso al almacenamiento: se muestran las iniciales.
    }
  }

  /// Abre la cámara o la galería. Devuelve false si el usuario canceló.
  Future<bool> pick(int childId, ImageSource source) async {
    final userId = _userId;
    if (userId == null) return false;
    final file = await ImagePicker().pickImage(
      source: source,
      maxWidth: 900,
      maxHeight: 900,
      imageQuality: 85,
      requestFullMetadata: false,
    );
    if (file == null) return false;
    final path = await _store.save(userId, childId, file.path);
    state = {...state, childId: path};
    return true;
  }

  Future<void> remove(int childId) async {
    final userId = _userId;
    if (userId == null) return;
    await _store.remove(userId, childId);
    state = {...state}..remove(childId);
  }
}

final localPhotosProvider = NotifierProvider<LocalPhotos, Map<int, String>>(
  LocalPhotos.new,
);
