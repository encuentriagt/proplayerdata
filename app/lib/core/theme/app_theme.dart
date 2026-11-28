import 'package:material_ui/material_ui.dart';

import 'brand_colors.dart';
import 'typography.dart';

/// Tema Material 3 de ProPlayer Data (versión 3: blanco + tinta + colores del
/// logo con significado).
ThemeData buildTheme() {
  final scheme =
      ColorScheme.fromSeed(
        seedColor: PpdColors.ink,
        brightness: Brightness.light,
      ).copyWith(
        primary: PpdColors.ink,
        onPrimary: PpdColors.onInk,
        secondary: PpdColors.star,
        onSecondary: PpdColors.ink,
        tertiary: PpdColors.green,
        surface: PpdColors.surface,
        onSurface: PpdColors.ink,
        onSurfaceVariant: PpdColors.muted,
        outline: PpdColors.line,
        outlineVariant: PpdColors.hairline,
        error: PpdColors.error,
      );

  const field = BorderRadius.all(Radius.circular(12));
  const pill = StadiumBorder();
  final base = ThemeData(useMaterial3: true, colorScheme: scheme);

  return base.copyWith(
    scaffoldBackgroundColor: PpdColors.surface,
    textTheme: base.textTheme.apply(
      fontFamily: PpdType.body,
      bodyColor: PpdColors.ink,
      displayColor: PpdColors.ink,
    ),
    appBarTheme: AppBarTheme(
      backgroundColor: PpdColors.surface,
      foregroundColor: PpdColors.ink,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      scrolledUnderElevation: 0,
      centerTitle: false,
      titleTextStyle: PpdType.headline(30, color: PpdColors.ink),
    ),
    inputDecorationTheme: const InputDecorationTheme(
      filled: true,
      fillColor: Color(0xFFF7F6F5),
      border: OutlineInputBorder(borderRadius: field),
      enabledBorder: OutlineInputBorder(
        borderRadius: field,
        borderSide: BorderSide(color: PpdColors.line, width: 1.5),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: field,
        borderSide: BorderSide(color: PpdColors.goldText, width: 2),
      ),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: PpdColors.ink,
        foregroundColor: PpdColors.onInk,
        minimumSize: const Size.fromHeight(52),
        shape: pill,
        textStyle: const TextStyle(
          fontFamily: PpdType.body,
          fontSize: 16,
          fontWeight: FontWeight.w700,
        ),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: PpdColors.ink,
        shape: pill,
        side: const BorderSide(color: PpdColors.ink, width: 1.5),
        textStyle: const TextStyle(
          fontFamily: PpdType.body,
          fontWeight: FontWeight.w600,
        ),
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(foregroundColor: PpdColors.ink),
    ),
    chipTheme: base.chipTheme.copyWith(
      shape: pill,
      side: const BorderSide(color: PpdColors.line, width: 1.5),
      backgroundColor: PpdColors.surface,
      selectedColor: PpdColors.ink,
      checkmarkColor: PpdColors.onInk,
      labelStyle: const TextStyle(
        fontFamily: PpdType.body,
        fontWeight: FontWeight.w600,
        color: PpdColors.ink,
      ),
      secondaryLabelStyle: const TextStyle(
        fontFamily: PpdType.body,
        fontWeight: FontWeight.w600,
        color: PpdColors.onInk,
      ),
    ),
    cardTheme: const CardThemeData(
      color: PpdColors.surface,
      elevation: 0,
      surfaceTintColor: Colors.transparent,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.all(Radius.circular(16)),
        side: BorderSide(color: PpdColors.hairline),
      ),
    ),
    dividerTheme: const DividerThemeData(color: PpdColors.hairline),
    tabBarTheme: const TabBarThemeData(
      labelColor: PpdColors.ink,
      unselectedLabelColor: PpdColors.muted,
      indicatorColor: PpdColors.star,
    ),
    progressIndicatorTheme: const ProgressIndicatorThemeData(
      color: PpdColors.star,
    ),
  );
}
