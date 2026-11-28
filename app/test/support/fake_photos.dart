import 'package:app/features/children/data/local_photo_store.dart';
import 'package:flutter_riverpod/misc.dart';

/// Fotos locales en memoria (sin tocar el almacenamiento del sistema).
class FakePhotoStore extends LocalPhotoStore {
  final photos = <int, String>{};
  int clears = 0;

  @override
  Future<Map<int, String>> load(int userId) async => {...photos};

  @override
  Future<String> save(int userId, int childId, String sourcePath) async =>
      photos[childId] = sourcePath;

  @override
  Future<void> remove(int userId, int childId) async => photos.remove(childId);

  @override
  Future<void> clearAll() async {
    clears++;
    photos.clear();
  }

  Override get providerOverride =>
      localPhotoStoreProvider.overrideWithValue(this);
}
