import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/api_client.dart';
import '../../../core/network/api_json.dart';
import '../../../core/network/idempotency.dart';
import 'invitation_models.dart';

class InvitationsRepository {
  InvitationsRepository(this._dio);

  final Dio _dio;

  /// Invitaciones pendientes enviadas al correo de la cuenta.
  Future<List<Invitation>> pending() => guardApi(() async {
    final res = await _dio.get<Object?>('app/invitations');
    return apiList(res.data).map(Invitation.fromJson).toList();
  });

  /// ♻️ Acepta y devuelve el id del hijo vinculado.
  Future<int?> accept(int id, IdempotencyKey key) => guardApi(() async {
    final res = await _dio.post<Object?>(
      'app/invitations/$id/accept',
      options: key.options,
    );
    return _childId(res.data);
  });

  Future<void> decline(int id) =>
      guardApi(() => _dio.post<Object?>('app/invitations/$id/decline'));

  /// ♻️ Acepta con el código corto del correo (p. ej. `ABCD-2345`).
  Future<int?> redeem(String code, IdempotencyKey key) => guardApi(() async {
    final res = await _dio.post<Object?>(
      'app/invitations/redeem',
      data: {'code': code.trim()},
      options: key.options,
    );
    return _childId(res.data);
  });

  int? _childId(Object? body) {
    final id = apiMap(body)['child_id'];
    return id is int ? id : int.tryParse('$id');
  }
}

final invitationsRepositoryProvider = Provider<InvitationsRepository>(
  (ref) => InvitationsRepository(ref.watch(dioProvider)),
);
