import 'package:flutter/material.dart';

class SmartTaxiColors {
  static const brand = Color(0xff1d6fff);
  static const brandDeep = Color(0xff0b4fd1);
  // The lighter blue that tops every primary-CTA / hero gradient. Was
  // hardcoded as 0xff5b9dff separately in the passenger and driver CTA
  // buttons before being named here; the value matches the web panels'
  // --brand-light so the two products' CTAs are the same ramp.
  static const brandSky = Color(0xff65a3ff);
  static const brandSoft = Color(0xffb9d6ff);
  static const brandPale = Color(0xffeaf3ff);
  static const brandSurface = Color(0xfff2f7ff);
  // Kept in sync with SmartTaxiPalette.dark.appBackground below -- this is
  // the only remaining consumer (main.dart's system nav-bar color), but it
  // must match or the Android gesture bar shows a seam against the app's
  // black+blue dark background.
  static const bgDark = Color(0xff05070c);
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
  // A genuine amber, distinct from the blue accent -- previously this was
  // set to a near-identical blue (0xff0b66d8), which defeated the purpose
  // of a separate semantic "needs attention" color (pending payouts, road
  // hazards, active-trip status pills all rendered the same hue as the
  // primary CTA). Matches docs/design/BLUE_WHITE_DESIGN_SYSTEM_2026-07-15.md.
  static const warning = Color(0xffc98a12);
  static const warningSoft = Color(0xfffbf1de);
  // Rating stars. Amber, and deliberately NOT `warning`: stars had been
  // reading their colour off the warning token, so the day that token
  // changed the stars changed with it for no reason anyone intended.
  // A star means "good", which is the opposite of a caution.
  static const star = Color(0xffe8a317);
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
  // Field label/hint greys. Previously raw neutral greys (0xff9aa2b0 /
  // 0xffadb4bf) inline in main.dart's auth TextField — they read visibly
  // warm next to the cool blue chrome around them. These are the same
  // lightness, re-tinted toward the canonical blue-grey text-muted ramp.
  static const authFieldLabel = Color(0xff93a0be);
  static const authFieldHint = Color(0xffa9b4cc);
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

/// One shadow per surface.
///
/// Twelve places had independently arrived at the same recipe — a wide, soft
/// shadow *plus* a second tight one directly under the same card. Two
/// shadows means two light sources, and a surface lit from two directions at
/// once is what reads as heavy and slightly cheap however carefully the
/// alphas are tuned. Cards pull from here now, so depth is consistent across
/// the app and there is a single place to change it.
class SmartTaxiShadows {
  /// An ordinary content card resting on the page.
  static const card = <BoxShadow>[
    BoxShadow(color: Color(0x14102a52), blurRadius: 26, offset: Offset(0, 12)),
  ];

  /// A card that should read as lifted above its neighbours — a balance
  /// panel, a summary hero. Same light, held a little higher.
  static const raised = <BoxShadow>[
    BoxShadow(color: Color(0x1e102a52), blurRadius: 34, offset: Offset(0, 16)),
  ];

  /// Bottom sheets and bottom bars, which cast upward onto the page behind.
  static const sheet = <BoxShadow>[
    BoxShadow(color: Color(0x1e102a52), blurRadius: 36, offset: Offset(0, -12)),
  ];
}

/// Named text styles for the roles that recur across the app (title/body/
/// caption/button). Prefer these over inline `TextStyle(fontSize: .., ...)`
/// in new code so the same role reads identically on every screen.
class SmartTaxiTextStyles {
  static const title = TextStyle(
    color: SmartTaxiColors.text,
    fontSize: 30,
    height: 1.05,
    letterSpacing: -0.3,
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
    required this.warningSoft,
    required this.star,
    required this.brand,
    required this.brandDeep,
    required this.brandSky,
    required this.brandPale,
    required this.brandSurface,
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
  final Color warningSoft;
  final Color star;
  final Color brand;
  final Color brandDeep;
  final Color brandSky;
  final Color brandPale;
  final Color brandSurface;

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
    warningSoft: SmartTaxiColors.warningSoft,
    star: SmartTaxiColors.star,
    brand: SmartTaxiColors.brand,
    brandDeep: SmartTaxiColors.brandDeep,
    brandSky: SmartTaxiColors.brandSky,
    brandPale: SmartTaxiColors.brandPale,
    brandSurface: SmartTaxiColors.brandSurface,
  );

  // True black-and-blue dark theme, not navy: near-black surfaces with the
  // brand blue reserved for accents/glow, matching the reference direction
  // the user asked for (2026-07-29) over the earlier dark-navy palette.
  // Brand hues (accent/success/danger) stay identical to light — only neutral
  // surfaces, text and soft/surface washes change for dark backgrounds.
  static const dark = SmartTaxiPalette(
    appBackground: Color(0xff05070c),
    card: Color(0xff0d121f),
    cardWarm: Color(0xff141b2e),
    text: Color(0xfff5f7fb),
    textSecondary: Color(0xff9aa4ba),
    textMuted: Color(0xff6b7488),
    border: Color(0xff1f2740),
    borderStrong: SmartTaxiColors.brand,
    success: SmartTaxiColors.success,
    successSoft: Color(0xff123222),
    danger: Color(0xffef4444),
    dangerSoft: Color(0xff3a1414),
    warning: Color(0xffe0a93a),
    warningSoft: Color(0xff2e2210),
    star: Color(0xffffc043),
    brand: SmartTaxiColors.brand,
    brandDeep: Color(0xff5b9bff),
    brandSky: Color(0xff93c5ff),
    brandPale: Color(0xff16223e),
    brandSurface: Color(0xff101b33),
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
    Color? warningSoft,
    Color? star,
    Color? brand,
    Color? brandDeep,
    Color? brandSky,
    Color? brandPale,
    Color? brandSurface,
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
      warningSoft: warningSoft ?? this.warningSoft,
      star: star ?? this.star,
      brand: brand ?? this.brand,
      brandDeep: brandDeep ?? this.brandDeep,
      brandSky: brandSky ?? this.brandSky,
      brandPale: brandPale ?? this.brandPale,
      brandSurface: brandSurface ?? this.brandSurface,
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
      warningSoft: Color.lerp(warningSoft, other.warningSoft, t)!,
      star: Color.lerp(star, other.star, t)!,
      brand: Color.lerp(brand, other.brand, t)!,
      brandDeep: Color.lerp(brandDeep, other.brandDeep, t)!,
      brandSky: Color.lerp(brandSky, other.brandSky, t)!,
      brandPale: Color.lerp(brandPale, other.brandPale, t)!,
      brandSurface: Color.lerp(brandSurface, other.brandSurface, t)!,
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
      seedColor: SmartTaxiColors.brand,
      primary: SmartTaxiColors.brand,
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
    // The product uses blue action glyphs consistently: a map pin, payment
    // method and profile affordance should feel like parts of the same UI,
    // rather than inheriting arbitrary Material defaults from each screen.
    iconTheme: const IconThemeData(
      color: SmartTaxiColors.brandDeep,
      size: 22,
    ),
    primaryIconTheme: const IconThemeData(
      color: Colors.white,
      size: 22,
    ),
    cardTheme: CardThemeData(
      color: SmartTaxiColors.card,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(22),
        side: const BorderSide(color: SmartTaxiColors.border),
      ),
    ),
    textSelectionTheme: TextSelectionThemeData(
      cursorColor: SmartTaxiColors.brandDeep,
      selectionColor: SmartTaxiColors.brand.withValues(alpha: 0.22),
      selectionHandleColor: SmartTaxiColors.brandDeep,
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
        color: SmartTaxiColors.brandDeep,
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
        borderSide: const BorderSide(color: SmartTaxiColors.brand, width: 1.8),
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
    // Primary and secondary have to be able to sit side by side in a dialog
    // row and read as one pair, so height, radius and text size are shared
    // deliberately — they used to differ (56 vs 52 high, radius 20 vs 18),
    // which is visible at a glance when the two are adjacent.
    elevatedButtonTheme: ElevatedButtonThemeData(
      style: ElevatedButton.styleFrom(
        minimumSize: const Size.fromHeight(56),
        backgroundColor: SmartTaxiColors.brand,
        // White, not ink. Dark text on the accent is a holdover from the
        // retired gold theme, where near-black on gold was right; on this blue it
        // reads muddy and disagrees with the app's own primary CTAs, which
        // already draw their label white.
        foregroundColor: Colors.white,
        disabledBackgroundColor: SmartTaxiColors.brand.withValues(alpha: 0.45),
        disabledForegroundColor: Colors.white.withValues(alpha: 0.70),
        elevation: 0,
        shadowColor: SmartTaxiColors.brand.withValues(alpha: 0.24),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.w900),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        minimumSize: const Size.fromHeight(56),
        foregroundColor: SmartTaxiColors.text,
        // Hairline in the plain border token. This was `borderStrong` — a
        // full-strength accent outline — so next to a filled accent button
        // the two competed for the same emphasis instead of reading as
        // primary and secondary.
        side: const BorderSide(color: SmartTaxiColors.border),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800),
      ),
    ),
    // Some newer screens use Material's FilledButton while older ones use
    // ElevatedButton. Keep both primary actions visually identical so a
    // wallet, support or permission screen never feels like another app.
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        minimumSize: const Size.fromHeight(56),
        backgroundColor: SmartTaxiColors.brand,
        foregroundColor: Colors.white,
        disabledBackgroundColor: SmartTaxiColors.brand.withValues(alpha: 0.45),
        disabledForegroundColor: Colors.white.withValues(alpha: 0.70),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.w900),
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(
        foregroundColor: SmartTaxiColors.brandDeep,
        textStyle: const TextStyle(fontSize: 14, fontWeight: FontWeight.w800),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
      ),
    ),
    navigationBarTheme: NavigationBarThemeData(
      height: 74,
      backgroundColor: Colors.transparent,
      indicatorColor: SmartTaxiColors.brandSurface,
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
      seedColor: SmartTaxiColors.brand,
      brightness: Brightness.dark,
      primary: palette.brand,
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
    iconTheme: IconThemeData(color: palette.brandDeep, size: 22),
    primaryIconTheme: const IconThemeData(color: Colors.white, size: 22),
    cardTheme: CardThemeData(
      color: palette.card,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(22),
        side: BorderSide(color: palette.border),
      ),
    ),
    textSelectionTheme: TextSelectionThemeData(
      cursorColor: palette.brandDeep,
      selectionColor: palette.brand.withValues(alpha: 0.28),
      selectionHandleColor: palette.brandDeep,
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
        color: palette.brandDeep,
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
        borderSide: BorderSide(color: palette.brand, width: 1.8),
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
    // Same pairing rules as the light theme above — shared height, radius
    // and text size so a dialog's two buttons read as one control group.
    elevatedButtonTheme: ElevatedButtonThemeData(
      style: ElevatedButton.styleFrom(
        minimumSize: const Size.fromHeight(56),
        backgroundColor: palette.brand,
        foregroundColor: Colors.white,
        disabledBackgroundColor: palette.brand.withValues(alpha: 0.35),
        disabledForegroundColor: Colors.white.withValues(alpha: 0.60),
        elevation: 0,
        shadowColor: palette.brand.withValues(alpha: 0.24),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.w900),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        minimumSize: const Size.fromHeight(56),
        foregroundColor: palette.text,
        side: BorderSide(color: palette.border),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800),
      ),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        minimumSize: const Size.fromHeight(56),
        backgroundColor: palette.brand,
        foregroundColor: Colors.white,
        disabledBackgroundColor: palette.brand.withValues(alpha: 0.35),
        disabledForegroundColor: Colors.white.withValues(alpha: 0.60),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.w900),
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(
        foregroundColor: palette.brandDeep,
        textStyle: const TextStyle(fontSize: 14, fontWeight: FontWeight.w800),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
      ),
    ),
    navigationBarTheme: NavigationBarThemeData(
      height: 74,
      backgroundColor: Colors.transparent,
      indicatorColor: palette.brandSurface,
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
