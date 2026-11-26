import 'package:flutter/material.dart';

import 'brand_colors.dart';

/// Tema Material 3 de ProPlayer Data.
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
        error: PpdColors.error,
      );

  const radius = BorderRadius.all(Radius.circular(10));

  return ThemeData(
    useMaterial3: true,
    colorScheme: scheme,
    scaffoldBackgroundColor: PpdColors.paper,
    appBarTheme: const AppBarTheme(
      backgroundColor: PpdColors.ink,
      foregroundColor: PpdColors.onInk,
      centerTitle: false,
    ),
    inputDecorationTheme: const InputDecorationTheme(
      filled: true,
      fillColor: PpdColors.surface,
      border: OutlineInputBorder(borderRadius: radius),
      enabledBorder: OutlineInputBorder(
        borderRadius: radius,
        borderSide: BorderSide(color: PpdColors.line),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: radius,
        borderSide: BorderSide(color: PpdColors.ink, width: 2),
      ),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: PpdColors.ink,
        foregroundColor: PpdColors.onInk,
        minimumSize: const Size.fromHeight(48),
        shape: const RoundedRectangleBorder(borderRadius: radius),
        textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(foregroundColor: PpdColors.ink),
    ),
    cardTheme: const CardThemeData(
      color: PpdColors.surface,
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.all(Radius.circular(16)),
        side: BorderSide(color: PpdColors.line),
      ),
    ),
  );
}
