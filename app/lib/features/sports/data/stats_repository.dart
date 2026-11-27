import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/api_client.dart';
import '../../../core/network/api_json.dart';
import 'sport_models.dart';

class StatsRepository {
  StatsRepository(this._dio);

  final Dio _dio;

  Future<ChildStats> childStats(int childId) => guardApi(() async {
    final res = await _dio.get<Object?>('app/children/$childId/stats');
    final body = res.data;
    final meta = body is Map && body['meta'] is Map ? body['meta'] as Map : {};
    return ChildStats.fromJson(apiMap(body), meta);
  });
}

final statsRepositoryProvider = Provider<StatsRepository>(
  (ref) => StatsRepository(ref.watch(dioProvider)),
);
