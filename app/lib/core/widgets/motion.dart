import 'dart:io';

import 'package:material_ui/material_ui.dart';

/// Si se permiten animaciones que no terminan (fondo de la cancha, cuenta
/// regresiva). Se apagan cuando el teléfono pide reducir movimiento y en las
/// pruebas automáticas (donde una animación infinita nunca «se asienta»).
bool continuousMotion(BuildContext context) {
  if (MediaQuery.maybeDisableAnimationsOf(context) ?? false) return false;
  return !_inTests;
}

final bool _inTests = Platform.environment.containsKey('FLUTTER_TEST');
