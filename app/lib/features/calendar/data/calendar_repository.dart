import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../../core/network/api_client.dart';
import '../../../core/network/api_json.dart';
import 'event_models.dart';

final _day = DateFormat('yyyy-MM-dd');

class CalendarRepository {
  CalendarRepository(this._dio);

  final Dio _dio;

  /// Calendario unificado de todos los hijos (máx. 120 días por consulta).
  Future<CalendarPage> calendar({
    required DateTime from,
    required DateTime to,
    int? sportId,
  }) => guardApi(() async {
    final res = await _dio.get<Object?>(
      'app/events',
      queryParameters: {
        'from': _day.format(from),
        'to': _day.format(to),
        'sport_id': ?sportId,
      },
    );
    final body = res.data;
    final meta = body is Map && body['meta'] is Map ? body['meta'] as Map : {};
    return CalendarPage(
      events: apiList(body).map(CalendarEvent.fromJson).toList(),
      historyLimited: meta['history_limited'] == true,
    );
  });

  /// Detalle del evento para un hijo. Fuera del plan: 403 `plan_limit`.
  Future<ChildEventDetail> childEvent(int childId, int eventId) =>
      guardApi(() async {
        final res = await _dio.get<Object?>(
          'app/children/$childId/events/$eventId',
        );
        return ChildEventDetail.fromJson(apiMap(res.data));
      });
}

final calendarRepositoryProvider = Provider<CalendarRepository>(
  (ref) => CalendarRepository(ref.watch(dioProvider)),
);
