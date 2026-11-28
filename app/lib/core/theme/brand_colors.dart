import 'dart:ui';

/// Línea gráfica ProPlayer Data (guía oficial v1, nov 2026) con la paleta de
/// la App (versión 3 de la maqueta). La App no usa marca blanca: siempre se ve
/// como ProPlayer Data.
///
/// Regla 60-30-10: blanco y papel de base, tinta para texto y el color del
/// logo solo como acento con significado (verde = fútbol y «ganó», oro =
/// básquetbol y logros, azul = béisbol y entrenos, rojo solo para lesión).
abstract final class PpdColors {
  // Base.
  static const paper = Color(0xFFF3F2F2);
  static const surface = Color(0xFFFFFFFF);
  static const ink = Color(0xFF201E1D);
  static const muted = Color(0xFF6B6560);
  static const line = Color(0xFFD6D3D1);
  static const hairline = Color(0xFFE7E5E4);
  static const onInk = Color(0xFFFFFFFF);

  // Colores del logo (fondos, íconos y cifras grandes).
  static const green = Color(0xFF25984D);
  static const greenBright = Color(0xFF3FCB72);
  static const greenDeep = Color(0xFF134226);
  static const star = Color(0xFFD28316);
  static const gold = Color(0xFFF3B54A);
  static const cyan = Color(0xFF0088B0);
  static const cyanDeep = Color(0xFF005570);
  static const leather = Color(0xFF9A5328);

  // Tonos para texto pequeño sobre blanco (contraste AA ≥ 4.5:1).
  static const greenText = Color(0xFF1F7A3E);
  static const goldText = Color(0xFFA8620A);
  static const cyanText = Color(0xFF006F8F);

  // Fondos suaves de etiquetas.
  static const greenSoft = Color(0xFFDDF1E4);
  static const goldSoft = Color(0xFFFCEBCB);
  static const cyanSoft = Color(0xFFDCEFF5);

  // Cancha (fondo del inicio de sesión).
  static const pitch = Color(0xFF0E2618);
  static const pitchDark = Color(0xFF0B1A10);

  // Lesión y errores: el rojo se reserva para esto.
  static const error = Color(0xFFB3261E);
  static const errorBg = Color(0xFFF9E3E1);
  static const infoBg = Color(0xFFE3EEF3);
  static const infoInk = Color(0xFF0B4F66);
}
