import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/api_client.dart';
import '../../../core/network/api_json.dart';
import 'children_models.dart';

class ChildrenRepository {
  ChildrenRepository(this._dio);

  final Dio _dio;

  /// Todos los hijos vinculados, de todas las organizaciones.
  Future<List<Child>> children() => guardApi(() async {
    final res = await _dio.get<Object?>('app/children');
    return apiList(res.data).map(Child.fromJson).toList();
  });

  /// Desvincular a un hijo de la cuenta.
  Future<void> unlink(int childId) =>
      guardApi(() => _dio.delete<Object?>('app/children/$childId'));
}

final childrenRepositoryProvider = Provider<ChildrenRepository>(
  (ref) => ChildrenRepository(ref.watch(dioProvider)),
);
