import 'package:flutter/material.dart';

class SmartTaxiColors {
  static const gold = Color(0xff1d6fff);
  static const goldDeep = Color(0xff0b4fd1);
  static const goldSoft = Color(0xffb9d6ff);
  static const goldPale = Color(0xffeaf3ff);
  static const goldSurface = Color(0xfff2f7ff);
  static const bgDark = Color(0xff071426);
  static const bgDark2 = Color(0xff0b1b33);
  static const cardDark = Color(0xff10223b);
  static const cardDark2 = Color(0xff162c49);
  static const background = Color(0xffffffff);
  static const appBackground = Color(0xfff7fbff);
  static const card = Color(0xffffffff);
  static const cardWarm = Color(0xfff2f7ff);
  static const text = Color(0xff111827);
  static const textSecondary = Color(0xff606978);
  static const textMuted = Color(0xff9ca3af);
  static const border = Color(0xffe2e6ee);
  static const borderStrong = Color(0xff1d6fff);
  static const success = Color(0xff16a34a);
  static const successSoft = Color(0xffecfdf3);
  static const danger = Color(0xffdc2626);
  static const dangerSoft = Color(0xfffef2f2);
  static const warning = Color(0xff0b66d8);
  static const mapOverlay = Color(0xebf7fbff);

  // Auth-flow specific tokens (welcome / SMS / password / new-password
  // screens). Kept separate from the generic `text`/`textSecondary` tokens
  // above because those screens use a deliberately deeper, cooler shade;
  // centralizing it here stops the raw hex from drifting screen to screen.
  static const authInk = Color(0xff071426);
  static const authMuted = Color(0xff5d6676);
  static const authCaption = Color(0xff8a8f98);
  static const authBorder = Color(0xffd8dde6);
  static const authIcon = Color(0xff252d3a);
  static const authChipBackground = Color(0xfff0f2f6);
  static const authGradientStart = Color(0xff3a86ff);
}

/// Spacing scale (px). Use these instead of ad-hoc numbers for new layout
/// code — most of the app still hardcodes raw values inline (a full
/// migration would touch thousands of call sites for no functional gain),
/// but this is the reference scale going forward.
class SmartTaxiSpacing {
  static const xs = 4.0;
  static const sm = 8.0;
  static const md = 12.0;
  static const lg = 16.0;
  static const xl = 20.0;
  static const xxl = 24.0;
  static const xxxl = 32.0;
}

/// Corner-radius scale (px), covering the range actually in use across the
/// app (chips/inputs up to full sheet corners). Same reference-not-migration
/// intent as [SmartTaxiSpacing].
class SmartTaxiRadius {
  static const sm = 12.0;
  static const md = 16.0;
  static const lg = 20.0;
  static const xl = 24.0;
  static const sheet = 34.0;
}

/// Named text styles for the roles that recur across the app (title/body/
/// caption/button). Prefer these over inline `TextStyle(fontSize: .., ...)`
/// in new code so the same role reads identically on every screen.
class SmartTaxiTextStyles {
  static const title = TextStyle(
    color: SmartTaxiColors.text,
    fontSize: 22,
    height: 1.05,
    fontWeight: FontWeight.w900,
  );
  static const subtitle = TextStyle(
    color: SmartTaxiColors.textSecondary,
    fontSize: 14,
    height: 1.3,
    fontWeight: FontWeight.w700,
  );
  static const body = TextStyle(
    color: SmartTaxiColors.text,
    fontSize: 14,
    height: 1.4,
    fontWeight: FontWeight.w600,
  );
  static const caption = TextStyle(
    color: SmartTaxiColors.textSecondary,
    fontSize: 12,
    height: 1.3,
    fontWeight: FontWeight.w700,
  );
  static const button = TextStyle(
    color: Colors.white,
    fontSize: 16,
    height: 1,
    fontWeight: FontWeight.w900,
  );
}

/// Theme-aware color tokens for screens that have been migrated off the raw
/// [SmartTaxiColors] constants (new driver feature screens under
/// `lib/features/driver/screens/`). Read via `context.palette` — resolves to
/// [SmartTaxiPalette.light] under [buildSmartTaxiTheme] and
/// [SmartTaxiPalette.dark] under [buildSmartTaxiDarkTheme].
///
/// Most of the app (driver_shell.dart, passenger_shell.dart, main.dart)
/// still reads `SmartTaxiColors.x` directly and will NOT change when the
/// theme switches to dark — see the note on [buildSmartTaxiDarkTheme] for
/// why that migration is a separate, much larger pass.
class SmartTaxiPalette extends ThemeExtension<SmartTaxiPalette> {
  const SmartTaxiPalette({
    required this.appBackground,
    required this.card,
    required this.cardWarm,
    required this.text,
    required this.textSecondary,
    required this.textMuted,
    required this.border,
    required this.borderStrong,
    required this.success,
    required this.successSoft,
    required this.danger,
    required this.dangerSoft,
    required this.warning,
    required this.gold,
    required this.goldDeep,
    required this.goldPale,
    required this.goldSurface,
  });

  final Color appBackground;
  final Color card;
  final Color cardWarm;
  final Color text;
  final Color textSecondary;
  final Color textMuted;
  final Color border;
  final Color borderStrong;
  final Color success;
  final Color successSoft;
  final Color danger;
  final Color dangerSoft;
  final Color warning;
  final Color gold;
  final Color goldDeep;
  final Color goldPale;
  final Color goldSurface;

  static const light = SmartTaxiPalette(
    appBackground: SmartTaxiColors.appBackground,
    card: SmartTaxiColors.card,
    cardWarm: SmartTaxiColors.cardWarm,
    text: SmartTaxiColors.text,
    textSecondary: SmartTaxiColors.textSecondary,
    textMuted: SmartTaxiColors.textMuted,
    border: SmartTaxiColors.border,
    borderStrong: SmartTaxiColors.borderStrong,
    success: SmartTaxiColors.success,
    successSoft: SmartTaxiColors.successSoft,
    danger: SmartTaxiColors.danger,
    dangerSoft: SmartTaxiColors.dangerSoft,
    warning: SmartTaxiColors.warning,
    gold: SmartTaxiColors.gold,
    goldDeep: SmartTaxiColors.goldDeep,
    goldPale: SmartTaxiColors.goldPale,
    goldSurface: SmartTaxiColors.goldSurface,
  );

  // True black-and-blue dark theme, not navy: near-black surfaces with the
  // brand blue reserved for accents/glow, matching the reference direction
  // the user asked for (2026-07-29) over the earlier dark-navy palette.
  // Brand hues (gold/success/danger) stay identical to light — only neutral
  // surfaces, text and soft/surface washes change for dark backgrounds.
  static const dark = SmartTaxiPalette(
    appBackground: Color(0xff05070c),
    card: Color(0xff0d121f),
    cardWarm: Color(0xff141b2e),
    text: Color(0xfff5f7fb),
    textSecondary: Color(0xff9aa4ba),
    textMuted: Color(0xff6b7488),
    border: Color(0xff1f2740),
    borderStrong: SmartTaxiColors.gold,
    success: SmartTaxiColors.success,
    successSoft: Color(0xff123222),
    danger: Color(0xffef4444),
    dangerSoft: Color(0xff3a1414),
    warning: Color(0xff5b9bff),
    gold: SmartTaxiColors.gold,
    goldDeep: Color(0xff5b9bff),
    goldPale: Color(0xff16223e),
    goldSurface: Color(0xff101b33),
  );

  @override
  SmartTaxiPalette copyWith({
    Color? appBackground,
    Color? card,
    Color? cardWarm,
    Color? text,
    Color? textSecondary,
    Color? textMuted,
    Color? border,
    Color? borderStrong,
    Color? success,
    Color? successSoft,
    Color? danger,
    Color? dangerSoft,
    Color? warning,
    Color? gold,
    Color? goldDeep,
    Color? goldPale,
    Color? goldSurface,
  }) {
    return SmartTaxiPalette(
      appBackground: appBackground ?? this.appBackground,
      card: card ?? this.card,
      cardWarm: cardWarm ?? this.cardWarm,
      text: text ?? this.text,
      textSecondary: textSecondary ?? this.textSecondary,
      textMuted: textMuted ?? this.textMuted,
      border: border ?? this.border,
      borderStrong: borderStrong ?? this.borderStrong,
      success: success ?? this.success,
      successSoft: successSoft ?? this.successSoft,
      danger: danger ?? this.danger,
      dangerSoft: dangerSoft ?? this.dangerSoft,
      warning: warning ?? this.warning,
      gold: gold ?? this.gold,
      goldDeep: goldDeep ?? this.goldDeep,
      goldPale: goldPale ?? this.goldPale,
      goldSurface: goldSurface ?? this.goldSurface,
    );
  }

  @override
  SmartTaxiPalette lerp(ThemeExtension<SmartTaxiPalette>? other, double t) {
    if (other is! SmartTaxiPalette) return this;
    return SmartTaxiPalette(
      appBackground: Color.lerp(appBackground, other.appBackground, t)!,
      card: Color.lerp(card, other.card, t)!,
      cardWarm: Color.lerp(cardWarm, other.cardWarm, t)!,
      text: Color.lerp(text, other.text, t)!,
      textSecondary: Color.lerp(textSecondary, other.textSecondary, t)!,
      textMuted: Color.lerp(textMuted, other.textMuted, t)!,
      border: Color.lerp(border, other.border, t)!,
      borderStrong: Color.lerp(borderStrong, other.borderStrong, t)!,
      success: Color.lerp(success, other.success, t)!,
      successSoft: Color.lerp(successSoft, other.successSoft, t)!,
      danger: Color.lerp(danger, other.danger, t)!,
      dangerSoft: Color.lerp(dangerSoft, other.dangerSoft, t)!,
      warning: Color.lerp(warning, other.warning, t)!,
      gold: Color.lerp(gold, other.gold, t)!,
      goldDeep: Color.lerp(goldDeep, other.goldDeep, t)!,
      goldPale: Color.lerp(goldPale, other.goldPale, t)!,
      goldSurface: Color.lerp(goldSurface, other.goldSurface, t)!,
    );
  }
}

extension SmartTaxiPaletteX on BuildContext {
  SmartTaxiPalette get palette =>
      Theme.of(this).extension<SmartTaxiPalette>() ?? SmartTaxiPalette.light;
}

ThemeData buildSmartTaxiTheme() {
  final base = ThemeData(
    useMaterial3: true,
    colorScheme: ColorScheme.fromSeed(
      seedColor: SmartTaxiColors.gold,
      primary: SmartTaxiColors.gold,
      surface: SmartTaxiColors.card,
    ),
  );

  return base.copyWith(
    extensions: const [SmartTaxiPalette.light],
    scaffoldBackgroundColor: SmartTaxiColors.appBackground,
    // No 'Inter' font is bundled as an asset (pubspec.yaml has no `fonts:`
    // section), so declaring fontFamily: 'Inter' here was a silent no-op —
    // every screen was already rendering with this fallback stack. Dropping
    // the phantom primary family just makes that explicit instead of
    // implying a custom typeface that was never actually loaded.
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

// A real dark ThemeData + SmartTaxiPalette.dark extension. Screens that read
// colors via `context.palette` (new driver feature screens under
// `lib/features/driver/screens/`) render correctly in both themes.
//
// IMPORTANT CAVEAT: most of the app (driver_shell.dart, passenger_shell.dart,
// main.dart) still paints its own background *and* text color from hardcoded
// SmartTaxiColors constants (Container(color: appBackground), Text with no
// style, etc.) instead of reading Theme.of(context)/context.palette. An
// earlier attempt at a dark ThemeData here flipped textTheme's body/display
// color to white while those hardcoded light Container backgrounds stayed
// put — confirmed on-device: the Settings screen title rendered
// white-on-white, unreadable.
//
// So: the Settings theme picker switching to "Dark" now genuinely changes
// system chrome (status bar/nav bar), Material component defaults, and every
// context.palette-based screen — but legacy screens built before this pass
// will keep rendering with their hardcoded light colors until they're
// migrated to context.palette too (tracked as the same "extract driver_shell
// into modules" follow-up work, done incrementally per file, not in one
// pass).
ThemeData buildSmartTaxiDarkTheme() {
  const palette = SmartTaxiPalette.dark;
  final base = ThemeData(
    useMaterial3: true,
    brightness: Brightness.dark,
    colorScheme: ColorScheme.fromSeed(
      seedColor: SmartTaxiColors.gold,
      brightness: Brightness.dark,
      primary: palette.gold,
      surface: palette.card,
    ),
  );

  return base.copyWith(
    extensions: const [palette],
    scaffoldBackgroundColor: palette.appBackground,
    textTheme: base.textTheme.apply(
      bodyColor: palette.text,
      displayColor: palette.text,
      fontFamilyFallback: const ['SF Pro Display', 'Segoe UI', 'system-ui'],
    ),
    appBarTheme: AppBarTheme(
      backgroundColor: palette.appBackground,
      foregroundColor: palette.text,
      elevation: 0,
      centerTitle: false,
      surfaceTintColor: Colors.transparent,
    ),
    textSelectionTheme: TextSelectionThemeData(
      cursorColor: palette.goldDeep,
      selectionColor: palette.gold.withValues(alpha: 0.28),
      selectionHandleColor: palette.goldDeep,
    ),
    bottomSheetTheme: BottomSheetThemeData(
      backgroundColor: palette.appBackground,
      surfaceTintColor: Colors.transparent,
      modalBackgroundColor: palette.appBackground,
      modalBarrierColor: const Color(0x8a000000),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(30)),
      ),
      clipBehavior: Clip.antiAlias,
    ),
    drawerTheme: DrawerThemeData(
      backgroundColor: palette.appBackground,
      surfaceTintColor: Colors.transparent,
    ),
    snackBarTheme: SnackBarThemeData(
      behavior: SnackBarBehavior.floating,
      backgroundColor: palette.card,
      contentTextStyle: TextStyle(
        color: palette.text,
        fontWeight: FontWeight.w700,
      ),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: palette.card,
      labelStyle: TextStyle(
        color: palette.textSecondary,
        fontSize: 13,
        fontWeight: FontWeight.w700,
      ),
      floatingLabelStyle: TextStyle(
        color: palette.goldDeep,
        fontSize: 13,
        fontWeight: FontWeight.w800,
      ),
      contentPadding: const EdgeInsets.symmetric(horizontal: 18, vertical: 16),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(20),
        borderSide: BorderSide(color: palette.border),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(20),
        borderSide: BorderSide(color: palette.border),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(20),
        borderSide: BorderSide(color: palette.gold, width: 1.8),
      ),
      errorBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(20),
        borderSide: BorderSide(color: palette.danger),
      ),
      focusedErrorBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(20),
        borderSide: BorderSide(color: palette.danger, width: 1.8),
      ),
    ),
    elevatedButtonTheme: ElevatedButtonThemeData(
      style: ElevatedButton.styleFrom(
        minimumSize: const Size.fromHeight(56),
        backgroundColor: palette.gold,
        foregroundColor: SmartTaxiColors.text,
        disabledBackgroundColor: palette.gold.withValues(alpha: 0.35),
        disabledForegroundColor: palette.text.withValues(alpha: 0.55),
        elevation: 0,
        shadowColor: palette.gold.withValues(alpha: 0.24),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.w900),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        minimumSize: const Size.fromHeight(52),
        foregroundColor: palette.text,
        side: BorderSide(color: palette.borderStrong),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
        textStyle: const TextStyle(fontSize: 15, fontWeight: FontWeight.w800),
      ),
    ),
    navigationBarTheme: NavigationBarThemeData(
      height: 74,
      backgroundColor: Colors.transparent,
      indicatorColor: palette.goldSurface,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      labelTextStyle: WidgetStateProperty.resolveWith((states) {
        final selected = states.contains(WidgetState.selected);
        return TextStyle(
          color: selected ? palette.text : palette.textSecondary,
          fontSize: 12,
          fontWeight: selected ? FontWeight.w900 : FontWeight.w700,
        );
      }),
    ),
  );
}
