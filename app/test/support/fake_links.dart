import 'dart:async';

import 'package:app/features/invitations/application/link_invitation.dart';
import 'package:flutter_riverpod/misc.dart';

/// Enlaces simulados: [initialUri] al abrir y [send] con la App abierta.
class FakeLinkSource implements LinkSource {
  FakeLinkSource([this.initialUri]);

  final Uri? initialUri;
  final _controller = StreamController<Uri>.broadcast();

  void send(Uri uri) => _controller.add(uri);

  @override
  Future<Uri?> initial() async => initialUri;

  @override
  Stream<Uri> get stream => _controller.stream;

  Override get providerOverride => linkSourceProvider.overrideWithValue(this);
}
