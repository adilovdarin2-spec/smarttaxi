import 'package:flutter/material.dart';

class SmartTaxiColors {
  static const gold = Color(0xfff5c542);
  static const goldDeep = Color(0xff9a6b11);
  static const goldSoft = Color(0xfff6e6b8);
  static const goldPale = Color(0xfffff3d6);
  static const goldSurface = Color(0xfffff8e6);
  static const bgDark = Color(0xff050505);
  static const bgDark2 = Color(0xff0c0c0c);
  static const cardDark = Color(0xff14181f);
  static const cardDark2 = Color(0xff1f232b);
  static const background = Color(0xffffffff);
  static const appBackground = Color(0xfffffcf6);
  static const card = Color(0xffffffff);
  static const cardWarm = Color(0xfffff9ea);
  static const text = Color(0xff141414);
  static const textSecondary = Color(0xff666666);
  static const textMuted = Color(0xff9a9a9a);
  static const border = Color(0xffefe2c4);
  static const borderStrong = Color(0xffd4af37);
  static const success = Color(0xff16a34a);
  static const successSoft = Color(0xffecfdf3);
  static const danger = Color(0xffdc2626);
  static const dangerSoft = Color(0xfffef2f2);
  static const warning = Color(0xffb7791f);
  static const mapOverlay = Color(0xebfffcf6);
}

ThemeData buildSmartTaxiTheme() {
  final base = ThemeData(
    useMaterial3: true,
    fontFamily: 'Inter',
    colorScheme: ColorScheme.fromSeed(
      seedColor: SmartTaxiColors.gold,
      primary: SmartTaxiColors.gold,
      surface: SmartTaxiColors.card,
    ),
  );

  return base.copyWith(
    scaffoldBackgroundColor: SmartTaxiColors.appBackground,
    textTheme: base.textTheme.apply(
      bodyColor: SmartTaxiColors.text,
      displayColor: SmartTaxiColors.text,
      fontFamilyFallback: const ['SF Pro Display', 'Segoe UI', 'system-ui'],
    ),
    appBarTheme: const AppBarTheme(
      backgroundColor: SmartTaxiColors.background,
      foregroundColor: SmartTaxiColors.text,
      elevation: 0,
      centerTitle: false,
      surfaceTintColor: Colors.transparent,
    ),
    textSelectionTheme: TextSelectionThemeData(
      cursorColor: SmartTaxiColors.goldDeep,
      selectionColor: SmartTaxiColors.gold.withValues(alpha: 0.22),
      selectionHandleColor: SmartTaxiColors.goldDeep,
    ),
    bottomSheetTheme: const BottomSheetThemeData(
      backgroundColor: SmartTaxiColors.background,
      surfaceTintColor: Colors.transparent,
      modalBackgroundColor: SmartTaxiColors.background,
      modalBarrierColor: Color(0x52000000),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(30)),
      ),
      clipBehavior: Clip.antiAlias,
    ),
    drawerTheme: const DrawerThemeData(
      backgroundColor: SmartTaxiColors.appBackground,
      surfaceTintColor: Colors.transparent,
    ),
    snackBarTheme: SnackBarThemeData(
      behavior: SnackBarBehavior.floating,
      backgroundColor: SmartTaxiColors.text,
      contentTextStyle: const TextStyle(
        color: SmartTaxiColors.background,
        fontWeight: FontWeight.w700,
      ),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: SmartTaxiColors.background,
      labelStyle: const TextStyle(
        color: SmartTaxiColors.textSecondary,
        fontSize: 13,
        fontWeight: FontWeight.w700,
      ),
      floatingLabelStyle: const TextStyle(
        color: SmartTaxiColors.goldDeep,
        fontSize: 13,
        fontWeight: FontWeight.w800,
      ),
      contentPadding: const EdgeInsets.symmetric(horizontal: 18, vertical: 16),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(20),
        borderSide: const BorderSide(color: SmartTaxiColors.border),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(20),
        borderSide: const BorderSide(color: SmartTaxiColors.border),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(20),
        borderSide: const BorderSide(color: SmartTaxiColors.gold, width: 1.8),
      ),
      errorBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(20),
        borderSide: const BorderSide(color: SmartTaxiColors.danger),
      ),
      focusedErrorBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(20),
        borderSide: const BorderSide(color: SmartTaxiColors.danger, width: 1.8),
      ),
    ),
    elevatedButtonTheme: ElevatedButtonThemeData(
      style: ElevatedButton.styleFrom(
        minimumSize: const Size.fromHeight(56),
        backgroundColor: SmartTaxiColors.gold,
        foregroundColor: SmartTaxiColors.text,
        disabledBackgroundColor: SmartTaxiColors.gold.withValues(alpha: 0.45),
        disabledForegroundColor: SmartTaxiColors.text.withValues(alpha: 0.55),
        elevation: 0,
        shadowColor: SmartTaxiColors.gold.withValues(alpha: 0.24),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.w900),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        minimumSize: const Size.fromHeight(52),
        foregroundColor: SmartTaxiColors.text,
        side: const BorderSide(color: SmartTaxiColors.borderStrong),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
        textStyle: const TextStyle(fontSize: 15, fontWeight: FontWeight.w800),
      ),
    ),
    navigationBarTheme: NavigationBarThemeData(
      height: 74,
      backgroundColor: Colors.transparent,
      indicatorColor: SmartTaxiColors.goldSurface,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      labelTextStyle: WidgetStateProperty.resolveWith((states) {
        final selected = states.contains(WidgetState.selected);
        return TextStyle(
          color:
              selected ? SmartTaxiColors.text : SmartTaxiColors.textSecondary,
          fontSize: 12,
          fontWeight: selected ? FontWeight.w900 : FontWeight.w700,
        );
      }),
    ),
  );
}
