import 'dart:async';

import 'package:app_links/app_links.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../../../core/network/api_exception.dart';
import '../../../core/network/idempotency.dart';
import '../../auth/application/session_controller.dart';
import '../../children/application/children_providers.dart';
import '../data/invitations_repository.dart';
import 'invitations_providers.dart';

/// Saca el token de `ppdguate://invitacion?token=…` o
/// `https://ppdguate.com/invitacion?token=…`. null si no es un enlace nuestro.
String? invitationTokenFrom(Uri uri) {
  final custom = uri.scheme == 'ppdguate' && uri.host == 'invitacion';
  final web =
      uri.scheme == 'https' &&
      (uri.host == 'ppdguate.com' || uri.host == 'www.ppdguate.com') &&
      (uri.path == '/invitacion' || uri.path == '/invitacion/');
  if (!custom && !web) return null;
  final token = uri.queryParameters['token']?.trim();
  return (token == null || token.isEmpty) ? null : token;
}

/// De dónde llegan los enlaces (se reemplaza en las pruebas).
abstract class LinkSource {
  Future<Uri?> initial();
  Stream<Uri> get stream;
}

class AppLinksSource implements LinkSource {
  final _links = AppLinks();

  @override
  Future<Uri?> initial() => _links.getInitialLink();

  @override
  Stream<Uri> get stream => _links.uriLinkStream;
}

final linkSourceProvider = Provider<LinkSource>((ref) => AppLinksSource());

/// Token pendiente guardado de forma segura (sobrevive a cerrar la App
/// mientras el padre crea su cuenta o verifica el correo).
class PendingInvitationStore {
  PendingInvitationStore([FlutterSecureStorage? storage])
    : _storage = storage ?? const FlutterSecureStorage();

  final FlutterSecureStorage _storage;
  static const _key = 'ppd.pending_invitation';

  Future<String?> read() => _storage.read(key: _key);
  Future<void> write(String token) => _storage.write(key: _key, value: token);
  Future<void> clear() => _storage.delete(key: _key);
}

final pendingInvitationStoreProvider = Provider<PendingInvitationStore>(
  (ref) => PendingInvitationStore(),
);

/// Resultado para mostrar al padre (cada uno con un número distinto).
class LinkOutcome {
  const LinkOutcome({required this.seq, required this.message, this.childId});

  final int seq;
  final String message;
  final int? childId;
}

class LinkInvitationState {
  const LinkInvitationState({this.pending = false, this.outcome});

  /// Hay un enlace esperando a que el padre entre o verifique su correo.
  final bool pending;
  final LinkOutcome? outcome;
}

/// Recibe el enlace de vinculación y vincula solo, sin contraseña.
class LinkInvitationController extends Notifier<LinkInvitationState> {
  StreamSubscription<Uri>? _sub;
  String? _token;
  IdempotencyKey? _key;
  bool _busy = false;
  int _seq = 0;

  PendingInvitationStore get _store => ref.read(pendingInvitationStoreProvider);

  @override
  LinkInvitationState build() {
    ref.listen(sessionControllerProvider, (_, _) => _tryConsume());
    ref.onDispose(() => _sub?.cancel());
    Future.microtask(_start);
    return const LinkInvitationState();
  }

  Future<void> _start() async {
    try {
      _token = await _store.read();
    } catch (_) {
      _token = null;
    }
    if (_token != null) state = LinkInvitationState(pending: true);
    final source = ref.read(linkSourceProvider);
    _sub = source.stream.listen(handle, onError: (_) {});
    try {
      final first = await source.initial();
      if (first != null) await handle(first);
    } catch (_) {
      // Sin enlace inicial.
    }
    await _tryConsume();
  }

  /// Llega un enlace (al abrir la App o con la App abierta).
  Future<void> handle(Uri uri) async {
    final token = invitationTokenFrom(uri);
    if (token == null) return;
    if (token != _token) _key = null;
    _token = token;
    try {
      await _store.write(token);
    } catch (_) {
      // Se queda en memoria.
    }
    state = LinkInvitationState(pending: true, outcome: state.outcome);
    await _tryConsume();
  }

  bool get _canLink {
    final s = ref.read(sessionControllerProvider);
    return s is SignedIn &&
        !s.profile.mustVerifyEmail &&
        !s.profile.mustChangePassword;
  }

  Future<void> _tryConsume() async {
    final token = _token;
    if (token == null || _busy || !_canLink) return;
    _busy = true;
    final key = _key ??= IdempotencyKey();
    try {
      final linked = await ref
          .read(invitationsRepositoryProvider)
          .acceptToken(token, key);
      await _finish();
      ref.invalidate(childrenProvider);
      ref.invalidate(invitationsProvider);
      final name = linked.firstName ?? 'Su hijo';
      final org = linked.organizationName;
      _emit(
        org == null
            ? 'Listo: se vinculó a $name con su cuenta.'
            : 'Listo: se vinculó a $name ($org) con su cuenta.',
        childId: linked.childId,
      );
    } on ApiException catch (e) {
      if (e.isNetwork) {
        // Se reintenta con la misma clave al volver a abrir o entrar.
        _emit(e.message, keepPending: true);
      } else {
        await _finish();
        _emit(e.message);
      }
    } finally {
      _busy = false;
    }
  }

  Future<void> _finish() async {
    _token = null;
    _key = null;
    try {
      await _store.clear();
    } catch (_) {}
  }

  void _emit(String message, {int? childId, bool keepPending = false}) {
    state = LinkInvitationState(
      pending: keepPending,
      outcome: LinkOutcome(seq: ++_seq, message: message, childId: childId),
    );
  }
}

final linkInvitationProvider =
    NotifierProvider<LinkInvitationController, LinkInvitationState>(
      LinkInvitationController.new,
    );
