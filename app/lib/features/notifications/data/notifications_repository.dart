import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/api_client.dart';
import '../../../core/network/api_json.dart';

/// Un aviso de la bandeja (`/me/notifications`).
class AppNotification {
  const AppNotification({
    required this.id,
    required this.kind,
    required this.title,
    this.body,
    this.data = const {},
    this.read = false,
    this.createdAt,
  });

  final int id;

  /// callup, trainings, event_changed, event_cancelled, attendance,
  /// match_result, link_invitation (y más adelante `injury`).
  final String kind;
  final String title;
  final String? body;

  /// Datos del aviso (todo texto): event_id, player_id, child_name,
  /// organization_name, sport_code, status…
  final Map<String, String> data;
  final bool read;
  final String? createdAt;

  String? get childName => data['child_name'];
  String? get organizationName => data['organization_name'];
  String? get sportCode => data['sport_code'];
  int? get eventId => int.tryParse(data['event_id'] ?? '');

  /// Hijos del aviso: `player_id` o `player_ids` («3,5») si son varios.
  List<int> get childIds => [
    for (final s in (data['player_ids'] ?? data['player_id'] ?? '').split(','))
      ?int.tryParse(s.trim()),
  ];

  /// Lesión: aviso de asistencia con estado `injured` (o el tipo `injury`
  /// cuando el backend lo agregue).
  bool get isInjury =>
      kind == 'injury' || (kind == 'attendance' && data['status'] == 'injured');

  factory AppNotification.fromJson(Map<String, dynamic> json) {
    final raw = json['data'];
    return AppNotification(
      id: (json['id'] as num).toInt(),
      kind: '${json['kind'] ?? ''}',
      title: '${json['title'] ?? ''}',
      body: json['body'] as String?,
      data: {
        if (raw is Map)
          for (final e in raw.entries)
            if (e.value != null) '${e.key}': '${e.value}',
        // Desde v1.16 algunos datos vienen también en la raíz.
        for (final k in const ['organization_name', 'child_name', 'sport_code'])
          if (json[k] != null) k: '${json[k]}',
        if (json['player_id'] != null) 'player_id': '${json['player_id']}',
      },
      read: json['read'] == true,
      createdAt: json['created_at'] as String?,
    );
  }
}

/// Bandeja de avisos + cantidad sin leer.
class NotificationsPage {
  const NotificationsPage({required this.items, required this.unread});

  final List<AppNotification> items;
  final int unread;
}

class NotificationsRepository {
  NotificationsRepository(this._dio);

  final Dio _dio;

  Future<NotificationsPage> inbox() => guardApi(() async {
    final res = await _dio.get<Object?>('me/notifications');
    final body = res.data;
    final meta = body is Map && body['meta'] is Map ? body['meta'] as Map : {};
    final items = apiList(body).map(AppNotification.fromJson).toList();
    final unread =
        (meta['unread'] as num?)?.toInt() ?? items.where((n) => !n.read).length;
    return NotificationsPage(items: items, unread: unread);
  });

  /// Marca como leídos los avisos dados (o todos si no se pasan).
  Future<void> markRead([List<int>? ids]) => guardApi(
    () => _dio.post<Object?>('me/notifications/read', data: {'ids': ?ids}),
  );
}

final notificationsRepositoryProvider = Provider<NotificationsRepository>(
  (ref) => NotificationsRepository(ref.watch(dioProvider)),
);
