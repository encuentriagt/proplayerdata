import 'package:material_ui/material_ui.dart';

/// Tipografía de la línea gráfica.
///
/// - **Saira Extra Condensed ExtraBold itálica**: titulares y cifras grandes
///   («HOY JUEGA ANA.», marcador, dorsal).
/// - **Saira**: textos, etiquetas e interfaz (tema de la App).
abstract final class PpdType {
  static const display = 'SairaExtraCondensed';
  static const body = 'Saira';

  /// Titular grande (se escribe en mayúsculas con `.toUpperCase()`).
  static TextStyle headline(
    double size, {
    Color? color,
    bool italic = true,
    double height = .9,
  }) => TextStyle(
    fontFamily: display,
    fontWeight: FontWeight.w800,
    fontStyle: italic ? FontStyle.italic : FontStyle.normal,
    fontSize: size,
    height: height,
    letterSpacing: -.01 * size,
    color: color,
  );

  /// Etiqueta pequeña en mayúsculas con espaciado (p. ej. «SUB-12 · 22 NOV.»).
  static TextStyle label({double size = 12, Color? color}) => TextStyle(
    fontFamily: body,
    fontWeight: FontWeight.w600,
    fontSize: size,
    letterSpacing: .16 * size,
    color: color,
  );
}
