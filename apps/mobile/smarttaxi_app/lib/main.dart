import 'dart:async';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:sentry_flutter/sentry_flutter.dart';
import 'package:url_launcher/url_launcher.dart';

import 'core/api/api_client.dart';
import 'core/auth/auth_store.dart';
import 'core/config/app_config.dart';
import 'core/legal/legal_content.dart';
import 'core/push/push_service.dart';
import 'core/sockets/socket_service.dart';
import 'core/theme/app_theme.dart';
import 'core/utils/active_locale.dart';
import 'core/widgets/brand_logo.dart';
import 'core/widgets/exit_on_double_back.dart';
import 'features/driver/driver_shell.dart';
import 'features/passenger/passenger_shell.dart';
import 'features/shared/models.dart';
import 'l10n/app_localizations.dart';

Future<void> main() async {
  // Crash reporting is a no-op until AppConfig.sentryDsn is set at build
  // time (--dart-define=SENTRY_DSN=...) — same "wired but dormant" pattern
  // as the backend's Sentry setup and the push-notification Firebase gate.
  await SentryFlutter.init(
    (options) {
      options.dsn = AppConfig.sentryDsn;
      options.tracesSampleRate = 0.1;
    },
    appRunner: _runApp,
  );
}

Future<void> _runApp() async {
  WidgetsFlutterBinding.ensureInitialized();
  await SystemChrome.setPreferredOrientations(const [
    DeviceOrientation.portraitUp,
  ]);
  await _showAppSystemUi();
  ErrorWidget.builder = (details) => const _RuntimeFallbackScreen();
  final authStore = AuthStore();
  final api = ApiClient(authStore);
  final sockets = SocketService(authStore);
  runApp(SmartTaxiApp(api: api, authStore: authStore, sockets: sockets));
}

Future<void> _showAppSystemUi() async {
  await SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);
  // Just a sane pre-first-frame default (app boots into ThemeMode.light) —
  // the MaterialApp `builder` below takes over every frame after that and
  // keeps this in sync with the active theme, including live toggles and
  // ThemeMode.system following the OS.
  SystemChrome.setSystemUIOverlayStyle(const SystemUiOverlayStyle(
    statusBarColor: Colors.transparent,
    statusBarIconBrightness: Brightness.dark,
    statusBarBrightness: Brightness.light,
    systemStatusBarContrastEnforced: false,
    systemNavigationBarColor: SmartTaxiColors.appBackground,
    systemNavigationBarIconBrightness: Brightness.dark,
    systemNavigationBarContrastEnforced: false,
  ));
}

// Keeps the status bar + system gesture/nav bar in sync with the resolved
// app theme (light/dark/system) on every rebuild — without this they stay
// frozen at whatever `_showAppSystemUi` set once at boot, so toggling the
// in-app theme left native chrome mismatched with the content (e.g. a black
// nav bar under the light theme, or a light one under dark).
SystemUiOverlayStyle _systemUiStyleFor(Brightness brightness) {
  final isDark = brightness == Brightness.dark;
  return SystemUiOverlayStyle(
    statusBarColor: Colors.transparent,
    statusBarIconBrightness: isDark ? Brightness.light : Brightness.dark,
    statusBarBrightness: isDark ? Brightness.dark : Brightness.light,
    systemStatusBarContrastEnforced: false,
    systemNavigationBarColor:
        isDark ? SmartTaxiColors.bgDark : SmartTaxiColors.appBackground,
    systemNavigationBarIconBrightness:
        isDark ? Brightness.light : Brightness.dark,
    systemNavigationBarContrastEnforced: false,
  );
}

class SmartTaxiApp extends StatefulWidget {
  const SmartTaxiApp({
    super.key,
    required this.api,
    required this.authStore,
    required this.sockets,
  });

  final ApiClient api;
  final AuthStore authStore;
  final SocketService sockets;

  @override
  State<SmartTaxiApp> createState() => _SmartTaxiAppState();
}

class _SmartTaxiAppState extends State<SmartTaxiApp> {
  // Opening the map must never be held hostage by a slow profile response.
  // The cached session is already protected by secure storage and every
  // normal API call still validates the token server-side. This is only a
  // startup responsiveness budget, not a relaxed authentication rule.
  static const _sessionBootstrapNetworkBudget = Duration(seconds: 2);

  AppSession _session = AppSession.splash;
  String _accountLabel = '';
  String _accountPhone = '';
  String _accountId = '';
  bool _offline = false;
  StreamSubscription<List<ConnectivityResult>>? _connectivitySub;
  late final PushService _pushService = PushService(widget.api);
  AppVersionInfo? _versionInfo;
  bool _updateNudgeShown = false;
  Locale? _locale;
  ThemeMode _themeMode = ThemeMode.light;
  _AuthMessageKind? _authInitialError;
  bool _forcedLogoutInProgress = false;

  void setLocale(Locale locale) {
    setState(() => _locale = locale);
    unawaited(widget.authStore.saveLocale(locale.languageCode));
  }

  void setThemeMode(ThemeMode mode) {
    setState(() => _themeMode = mode);
    unawaited(widget.authStore.saveThemeMode(mode.name));
  }

  Future<void> _loadThemeMode() async {
    final saved = await widget.authStore.readThemeMode();
    final mode = ThemeMode.values.firstWhere(
      (m) => m.name == saved,
      orElse: () => ThemeMode.light,
    );
    if (mounted) setState(() => _themeMode = mode);
  }

  Future<void> _loadLocale() async {
    final saved = await widget.authStore.readLocale();
    if (saved != null && mounted) setState(() => _locale = Locale(saved));
  }

  @override
  void initState() {
    super.initState();
    unawaited(_loadLocale());
    unawaited(_loadThemeMode());
    widget.api.onSessionExpired = _handleSessionExpired;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) {
        _restoreSession();
      }
    });
    _watchConnectivity();
    unawaited(_checkAppVersion());
  }

  // Fires from ApiClient's Dio interceptor the instant any request comes
  // back 401/SESSION_SUPERSEDED — i.e. another device just logged into this
  // account and rotated session_version server-side (see common/auth.js).
  // Mirrors _logout() but also surfaces a reason on the auth screen instead
  // of dropping the user there with no explanation.
  Future<void> _handleSessionExpired() async {
    if (_forcedLogoutInProgress || _session == AppSession.auth) return;
    _forcedLogoutInProgress = true;
    widget.sockets.dispose();
    widget.api.clearToken();
    await widget.authStore.clear();
    if (mounted) {
      setState(() {
        _accountLabel = '';
        _accountPhone = '';
        _accountId = '';
        _authInitialError = _AuthMessageKind.sessionExpiredOtherDevice;
        _session = AppSession.auth;
      });
    }
    _forcedLogoutInProgress = false;
  }

  // Best-effort — a failed/slow check never blocks the app from opening
  // normally, it just means no update prompt this launch.
  Future<void> _checkAppVersion() async {
    try {
      final info = await widget.api.getAppVersionInfo(AppConfig.appVersion);
      if (mounted) setState(() => _versionInfo = info);
    } catch (_) {}
  }

  Future<void> _openUpdateUrl() async {
    final url = _versionInfo?.updateUrl;
    if (url == null || url.isEmpty) return;
    final uri = Uri.tryParse(url);
    if (uri == null) return;
    await launchUrl(uri, mode: LaunchMode.externalApplication);
  }

  void _maybeShowUpdateNudge() {
    if (_updateNudgeShown) return;
    final info = _versionInfo;
    if (info == null || info.updateRequired || !info.updateAvailable) return;
    _updateNudgeShown = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      showModalBottomSheet<void>(
        context: context,
        isScrollControlled: true,
        backgroundColor: Colors.transparent,
        builder: (_) => _UpdateAvailableSheet(
          info: info,
          onUpdate: () {
            Navigator.pop(context);
            unawaited(_openUpdateUrl());
          },
        ),
      );
    });
  }

  @override
  void dispose() {
    _connectivitySub?.cancel();
    super.dispose();
  }

  void _watchConnectivity() {
    unawaited(
      Connectivity().checkConnectivity().then(_applyConnectivity),
    );
    _connectivitySub =
        Connectivity().onConnectivityChanged.listen(_applyConnectivity);
  }

  void _applyConnectivity(List<ConnectivityResult> results) {
    final offline =
        results.isEmpty || results.every((r) => r == ConnectivityResult.none);
    if (!mounted || offline == _offline) return;
    setState(() => _offline = offline);
  }

  Future<void> _restoreSession() async {
    await Future<void>.delayed(const Duration(milliseconds: 1200));
    String? token;
    try {
      token = await widget.authStore.readToken();
    } catch (_) {
      // Secure storage can throw if the device's lock-screen credentials
      // changed and invalidated the keystore entry — without this catch,
      // _restoreSession() itself throws (this runs from a post-frame
      // callback with nothing awaiting it) and _session never advances
      // past AppSession.splash, stranding the user there indefinitely.
      token = null;
    }
    if (!mounted) return;
    if (token == null || token.isEmpty) {
      await _showAppSystemUi();
      if (!mounted) return;
      setState(() => _session = AppSession.auth);
      return;
    }
    try {
      final me = await widget.api.me().timeout(_sessionBootstrapNetworkBudget);
      await _saveUserFromPayload(me);
      final savedMode = await widget.authStore.readMode();
      if (!mounted) return;
      if (savedMode == 'driver' && await _canOpenDriver()) {
        if (!mounted) return;
        await _showAppSystemUi();
        if (!mounted) return;
        setState(() => _session = AppSession.driver);
      } else {
        await widget.authStore.saveMode('passenger');
        if (!mounted) return;
        await _showAppSystemUi();
        if (!mounted) return;
        setState(() => _session = AppSession.passenger);
      }
    } catch (error) {
      // A connectivity blip at launch (timeout/no route to host) isn't
      // proof the token is invalid — only a real response from the server
      // (e.g. 401) is. Wiping a valid session here meant a flaky network
      // at exactly the wrong moment logged the user out for no reason.
      final isConnectivityFailure = error is TimeoutException ||
          (error is DioException &&
              error.response == null &&
              const {
                DioExceptionType.connectionTimeout,
                DioExceptionType.sendTimeout,
                DioExceptionType.receiveTimeout,
                DioExceptionType.connectionError,
              }.contains(error.type));
      if (isConnectivityFailure) {
        // me() never answered, so there's no fresh payload to save — fall
        // back to whatever account details were cached from the last
        // successful login rather than leaving them blank.
        final cachedUser = await widget.authStore.readUser();
        if (!mounted) return;
        _accountLabel = cachedUser['label'] ?? '';
        _accountPhone = cachedUser['phone'] ?? '';
        _accountId = cachedUser['id'] ?? '';
        final savedMode = await widget.authStore.readMode();
        if (!mounted) return;
        await _showAppSystemUi();
        if (!mounted) return;
        setState(() => _session =
            savedMode == 'driver' ? AppSession.driver : AppSession.passenger);
        return;
      }
      widget.api.clearToken();
      await widget.authStore.clear();
      await _showAppSystemUi();
      if (mounted) setState(() => _session = AppSession.auth);
    }
  }

  Future<void> _handleLogin(Map<String, dynamic> authPayload) async {
    _authInitialError = null;
    await _saveUserFromPayload(authPayload);
    final role = _userRole(authPayload['user']);
    if (role == 'DRIVER' && await _canOpenDriver()) {
      await widget.authStore.saveMode('driver');
      if (!mounted) return;
      setState(() => _session = AppSession.driver);
      return;
    }
    await widget.authStore.saveMode('passenger');
    if (!mounted) return;
    setState(() => _session = AppSession.passenger);
  }

  Future<void> _saveUserFromPayload(Map<String, dynamic> payload) async {
    final user = payload['user'];
    _accountLabel = _userLabel(user);
    _accountPhone = _userPhone(user);
    _accountId = _userId(user);
    await widget.authStore.saveUser(
      label: _accountLabel,
      phone: _accountPhone,
      email: _userMail(user),
      role: _userRole(user),
      id: _accountId,
    );
    unawaited(_pushService.initialize());
  }

  Future<bool> _canOpenDriver() async {
    try {
      final result = await widget.api.getDriverRegions();
      return result.regions
          .any((region) => region.status == 'APPROVED' && region.isActive);
    } catch (_) {
      return false;
    }
  }

  Future<bool> _openDriverMode() async {
    final allowed = await _canOpenDriver();
    if (!allowed) return false;
    await widget.authStore.saveMode('driver');
    if (mounted) setState(() => _session = AppSession.driver);
    return true;
  }

  Future<void> _openPassengerMode() async {
    await widget.authStore.saveMode('passenger');
    if (mounted) setState(() => _session = AppSession.passenger);
  }

  Future<void> _logout() async {
    widget.sockets.dispose();
    widget.api.clearToken();
    await widget.authStore.clear();
    if (mounted) {
      setState(() {
        _accountLabel = '';
        _accountPhone = '';
        _accountId = '';
        _session = AppSession.auth;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final screen = switch (_session) {
      AppSession.splash => const _SplashScreen(),
      AppSession.auth => _PhotoAuthScreen(
          api: widget.api,
          onLoggedIn: _handleLogin,
          currentLocale: _locale,
          onChangeLocale: setLocale,
          initialError: _authInitialError,
        ),
      AppSession.passenger => PassengerShell(
          api: widget.api,
          authStore: widget.authStore,
          sockets: widget.sockets,
          pushMessages: _pushService.messages,
          accountLabel: _accountLabel,
          accountPhone: _accountPhone,
          accountId: _accountId,
          onLogout: _logout,
          onOpenDriverMode: _openDriverMode,
          onRequestNotifications: _pushService.requestPermission,
          currentLocale: _locale,
          onChangeLocale: setLocale,
          themeMode: _themeMode,
          onChangeThemeMode: setThemeMode,
        ),
      AppSession.driver => DriverShell(
          api: widget.api,
          authStore: widget.authStore,
          sockets: widget.sockets,
          pushMessages: _pushService.messages,
          accountLabel: _accountLabel,
          onLogout: _logout,
          onOpenPassengerMode: _openPassengerMode,
          onRequestNotifications: _pushService.requestPermission,
          currentLocale: _locale,
          onChangeLocale: setLocale,
          themeMode: _themeMode,
          onChangeThemeMode: setThemeMode,
        ),
    };
    if (_session != AppSession.splash) _maybeShowUpdateNudge();
    return MaterialApp(
      title: 'SmartTaxi',
      debugShowCheckedModeBanner: false,
      theme: buildSmartTaxiTheme(),
      darkTheme: buildSmartTaxiDarkTheme(),
      themeMode: _themeMode,
      locale: _locale,
      localizationsDelegates: const [
        AppLocalizations.delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      supportedLocales: AppLocalizations.supportedLocales,
      builder: (context, child) => AnnotatedRegion<SystemUiOverlayStyle>(
        value: _systemUiStyleFor(Theme.of(context).brightness),
        // Tapping outside a focused field anywhere in the app dismisses the
        // keyboard — none of the ~14 forms/sheets across passenger/driver
        // shells handle this individually, so it was app-wide missing
        // rather than one screen's oversight.
        child: GestureDetector(
          onTap: () => FocusManager.instance.primaryFocus?.unfocus(),
          behavior: HitTestBehavior.translucent,
          child: child!,
        ),
      ),
      // The splash screen manages its own loading state before the session
      // is known; showing the offline overlay on top of it would be
      // misleading (looks like a connectivity failure during normal boot).
      home: Stack(
        children: [
          screen,
          if (_offline && _session != AppSession.splash)
            _OfflineOverlay(
              onRetry: () =>
                  Connectivity().checkConnectivity().then(_applyConnectivity),
            ),
          // Hard update gate — takes over the whole screen, no dismiss, no
          // way to reach the app underneath. Only for updateRequired (below
          // minSupportedVersion); the softer updateAvailable case is the
          // dismissible bottom sheet in _maybeShowUpdateNudge instead.
          if (_session != AppSession.splash &&
              _versionInfo?.updateRequired == true)
            _UpdateRequiredScreen(
              info: _versionInfo!,
              onUpdate: _openUpdateUrl,
            ),
        ],
      ),
    );
  }
}

enum AppSession { splash, auth, passenger, driver }

bool _isCompactAuthViewport(BuildContext context) {
  final size = MediaQuery.sizeOf(context);
  return size.height < 840 || size.width < 390;
}

// How far down the screen the white card's top edge sits on every
// _AuthBackdrop screen — shared by every auth step's panel-position math
// so they all line up consistently. _AuthBackdrop itself now paints the
// full-screen background image (it has its own baked-in wordmark and
// wave graphic, sized for the whole screen, not just a top strip), so
// this no longer describes the image — only where the card overlays it.
double kAuthHeroHeight(Size size) =>
    (size.height * 0.52).clamp(380.0, 480.0).toDouble();

class _AuthBackdrop extends StatelessWidget {
  const _AuthBackdrop();

  @override
  Widget build(BuildContext context) {
    // BoxFit.cover + centered: fills every screen size without letterboxing
    // or visible stretching, cropping evenly from whichever edge is
    // relatively longer instead of skewing the image.
    return Positioned.fill(
      child: Stack(
        fit: StackFit.expand,
        children: [
          Image.asset(
            'assets/auth/auth_background_2026.png',
            fit: BoxFit.cover,
            alignment: Alignment.topCenter,
            filterQuality: FilterQuality.high,
            errorBuilder: (_, __, ___) => const DecoratedBox(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [SmartTaxiColors.brand, SmartTaxiColors.brandDeep],
                ),
              ),
            ),
          ),
          // The wordmark and its tagline used to be painted into the PNG.
          // That made the tagline permanently Russian: this is the first
          // screen the app ever shows, and on a Kazakh device every other
          // word on it was Kazakh while "ГОРОДСКОЕ ТАКСИ" sat under the logo
          // in Russian, with no string for a translator to reach. The app
          // ships ru/kk/uz/zh, so three of its four audiences saw it.
          //
          // Drawing it here also fixes a second, quieter problem: the image
          // is BoxFit.cover, so the baked text drifted off-centre on any
          // aspect ratio other than the 1080x1920 it was authored at.
          //
          // 0.19 of the height is where the baked wordmark sat on the
          // reference device, so the layout is unchanged where it was right.
          const _AuthWordmark(),
        ],
      ),
    );
  }
}

/// "SmartTaxi" plus the localised tagline, over the auth backdrop.
///
/// The two weights inside the wordmark are the supplied lockup: "Smart" solid
/// white and bold, "Taxi" the same size in a lighter weight and slightly
/// dimmed. Reproducing it as text rather than shipping a second PNG keeps it
/// crisp at every density and lets the tagline under it be translated.
class _AuthWordmark extends StatelessWidget {
  const _AuthWordmark();

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final size = MediaQuery.sizeOf(context);
    // 19% of the screen height is exactly where the baked wordmark used to
    // land: the artwork put it at y=366 of 1920, and the image is drawn
    // BoxFit.cover anchored topCenter, so on any taller-than-9:16 screen it
    // scaled to the height and 366/1920 stayed 19%. Measured against the
    // pre-change build on a Pixel 7a: 19.1%.
    //
    // Deliberately MediaQuery and not a LayoutBuilder — the first attempt
    // read constraints.maxHeight inside the backdrop's Stack and got a box
    // far shorter than the screen, which put the lockup at 0.7% of the
    // height, on top of the status bar.
    final scale = _isCompactAuthViewport(context) ? 0.86 : 1.0;
    return Align(
      alignment: Alignment.topCenter,
      child: Padding(
        padding: EdgeInsets.only(top: size.height * 0.19),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text.rich(
              TextSpan(
                children: [
                  TextSpan(
                    text: 'Smart',
                    style: TextStyle(
                      fontSize: 44 * scale,
                      fontWeight: FontWeight.w700,
                      color: Colors.white,
                      letterSpacing: -0.5,
                      height: 1.05,
                    ),
                  ),
                  TextSpan(
                    text: 'Taxi',
                    style: TextStyle(
                      fontSize: 44 * scale,
                      fontWeight: FontWeight.w300,
                      color: Colors.white.withValues(alpha: 0.92),
                      letterSpacing: -0.5,
                      height: 1.05,
                    ),
                  ),
                ],
              ),
              textAlign: TextAlign.center,
            ),
            SizedBox(height: 14 * scale),
            Container(
              width: 64 * scale,
              height: 1,
              color: Colors.white.withValues(alpha: 0.55),
            ),
            SizedBox(height: 12 * scale),
            Text(
              l10n.authTagline,
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 13 * scale,
                fontWeight: FontWeight.w500,
                color: Colors.white.withValues(alpha: 0.86),
                letterSpacing: 2.4 * scale,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _PhotoAuthBackButton extends StatelessWidget {
  const _PhotoAuthBackButton({required this.onTap});

  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white.withValues(alpha: 0.0),
      shape: const CircleBorder(),
      child: InkWell(
        customBorder: const CircleBorder(),
        onTap: onTap,
        child: SizedBox(
          width: 48,
          height: 48,
          child: Icon(
            Icons.arrow_back_rounded,
            color: SmartTaxiColors.authInk,
            size: MediaQuery.sizeOf(context).width < 390 ? 27 : 31,
          ),
        ),
      ),
    );
  }
}

class _PhotoAuthLanguageToggle extends StatelessWidget {
  const _PhotoAuthLanguageToggle({
    required this.currentLocale,
    required this.onChanged,
  });

  final Locale? currentLocale;
  final ValueChanged<Locale> onChanged;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final currentCode = activeLanguageCode(context, currentLocale);
    final options = <MapEntry<String, String>>[
      MapEntry('ru', l10n.languageRussian),
      MapEntry('kk', l10n.languageKazakh),
      MapEntry('uz', l10n.languageUzbek),
      MapEntry('zh', l10n.languageChinese),
    ];
    final currentLabel = options
        .firstWhere(
          (option) => option.key == currentCode,
          orElse: () => options.first,
        )
        .value;
    return Material(
      color: Colors.white.withValues(alpha: 0.85),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(999),
        side: BorderSide(color: SmartTaxiColors.authBorder),
      ),
      child: PopupMenuButton<String>(
        tooltip: '',
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        onSelected: (code) => onChanged(Locale(code)),
        itemBuilder: (context) => [
          for (final option in options)
            PopupMenuItem<String>(
              value: option.key,
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  SizedBox(
                    width: 20,
                    child: option.key == currentCode
                        ? const Icon(
                            Icons.check_rounded,
                            size: 16,
                            color: SmartTaxiColors.authInk,
                          )
                        : null,
                  ),
                  const SizedBox(width: 8),
                  Text(option.value),
                ],
              ),
            ),
        ],
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(
                Icons.language_rounded,
                size: 15,
                color: SmartTaxiColors.authIcon,
              ),
              const SizedBox(width: 6),
              Text(
                currentLabel,
                style: const TextStyle(
                  color: SmartTaxiColors.authInk,
                  fontSize: 12.5,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _PhotoSmsVerificationCard extends StatelessWidget {
  const _PhotoSmsVerificationCard({
    required this.compact,
    required this.keyboardOpen,
    required this.phone,
    required this.controller,
    required this.loading,
    required this.error,
    required this.info,
    required this.resendRemaining,
    required this.countdownLabel,
    required this.onChanged,
    required this.onSubmitted,
    required this.onContinue,
    required this.onResend,
  });

  final bool compact;
  final bool keyboardOpen;
  final String phone;
  final TextEditingController controller;
  final bool loading;
  final String? error;
  final String? info;
  final int resendRemaining;
  final String countdownLabel;
  final ValueChanged<String> onChanged;
  final ValueChanged<String>? onSubmitted;
  final VoidCallback? onContinue;
  final VoidCallback? onResend;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final titleSize = compact ? 26.0 : 30.0;
    final bottomSafe = MediaQuery.paddingOf(context).bottom;
    final showFooter = !keyboardOpen;
    return DecoratedBox(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.vertical(
          top: Radius.circular(compact ? 34 : 42),
        ),
        boxShadow: SmartTaxiShadows.sheet,
      ),
      child: Padding(
        padding: EdgeInsets.fromLTRB(
          compact ? 28 : 42,
          compact ? 28 : 38,
          compact ? 28 : 42,
          (keyboardOpen ? (compact ? 16 : 20) : (compact ? 24 : 30)) +
              bottomSafe,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              l10n.smsEnterCodeTitle,
              style: TextStyle(
                color: SmartTaxiColors.authInk,
                fontSize: titleSize,
                height: 1.05,
                fontWeight: FontWeight.w900,
                letterSpacing: -0.3,
              ),
            ),
            SizedBox(height: compact ? 14 : 18),
            Text(
              l10n.smsCodeSentSubtitle,
              style: TextStyle(
                color: SmartTaxiColors.authMuted,
                fontSize: compact ? 13.0 : 15.0,
                height: 1.35,
                fontWeight: FontWeight.w700,
              ),
            ),
            SizedBox(height: compact ? 10 : 13),
            Align(
              alignment: Alignment.centerLeft,
              child: _PhotoSmsPhoneChip(phone: phone, compact: compact),
            ),
            SizedBox(height: compact ? 24 : 31),
            Text(
              l10n.smsCodeHint,
              style: TextStyle(
                color: SmartTaxiColors.authMuted,
                fontSize: compact ? 14.2 : 15.6,
                height: 1.2,
                fontWeight: FontWeight.w800,
              ),
            ),
            SizedBox(height: compact ? 12 : 16),
            _PhotoSmsCodeInput(
              controller: controller,
              compact: compact,
              enabled: !loading,
              hasError: error != null,
              onChanged: onChanged,
              onSubmitted: onSubmitted,
            ),
            AnimatedSwitcher(
              duration: const Duration(milliseconds: 230),
              switchInCurve: Curves.easeOutCubic,
              switchOutCurve: Curves.easeInCubic,
              transitionBuilder: _authFeedbackTransitionBuilder,
              child: error != null
                  ? Padding(
                      key: const ValueKey('sms-error'),
                      padding: EdgeInsets.only(top: compact ? 12 : 15),
                      child: _PhotoAuthErrorBanner(text: error!),
                    )
                  : info != null
                      ? Padding(
                          key: const ValueKey('sms-info'),
                          padding: EdgeInsets.only(top: compact ? 12 : 15),
                          child: _PhotoAuthInfoLine(text: info!),
                        )
                      : SizedBox(
                          key: const ValueKey('sms-spacer'),
                          height: compact ? 12 : 18,
                        ),
            ),
            SizedBox(height: compact ? 8 : 12),
            _PhotoSmsResendRow(
              compact: compact,
              loading: loading,
              remaining: resendRemaining,
              countdownLabel: countdownLabel,
              onResend: onResend,
            ),
            SizedBox(height: compact ? 17 : 23),
            ValueListenableBuilder<TextEditingValue>(
              valueListenable: controller,
              builder: (context, value, _) {
                final smsReady =
                    value.text.replaceAll(RegExp(r'\D'), '').length == 6;
                return _PhotoAuthPrimaryButton(
                  loading: loading,
                  label: l10n.continueLabel,
                  loadingLabel: l10n.authCheckingLabel,
                  onPressed: smsReady && !loading ? onContinue : null,
                );
              },
            ),
            AnimatedSwitcher(
              duration: const Duration(milliseconds: 230),
              switchInCurve: Curves.easeOutCubic,
              switchOutCurve: Curves.easeInCubic,
              child: showFooter
                  ? Padding(
                      key: const ValueKey('sms-footer'),
                      padding: EdgeInsets.only(top: compact ? 22 : 28),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          const _PhotoSmsSafetyText(),
                          SizedBox(height: compact ? 24 : 31),
                          const _PhotoSmsFooter(),
                        ],
                      ),
                    )
                  : const SizedBox.shrink(key: ValueKey('sms-footer-hidden')),
            ),
          ],
        ),
      ),
    );
  }
}

class _PhotoSmsPhoneChip extends StatelessWidget {
  const _PhotoSmsPhoneChip({required this.phone, required this.compact});

  final String phone;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: EdgeInsets.symmetric(
        horizontal: compact ? 16 : 19,
        vertical: compact ? 10 : 12,
      ),
      decoration: BoxDecoration(
        color: SmartTaxiColors.authChipBackground,
        borderRadius: BorderRadius.circular(compact ? 13 : 15),
      ),
      child: Text(
        phone,
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: TextStyle(
          color: SmartTaxiColors.authInk,
          fontSize: compact ? 15.2 : 17,
          height: 1.1,
          fontWeight: FontWeight.w900,
          letterSpacing: 0.2,
        ),
      ),
    );
  }
}

class _PhotoSmsSafetyText extends StatelessWidget {
  const _PhotoSmsSafetyText();

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final compact = _isCompactAuthViewport(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          l10n.smsNeverShareCode,
          style: TextStyle(
            color: SmartTaxiColors.authInk,
            fontSize: compact ? 13.0 : 14.2,
            height: 1.2,
            fontWeight: FontWeight.w900,
          ),
        ),
        const SizedBox(height: 5),
        Text(
          l10n.smsStaffNeverAsk,
          style: TextStyle(
            color: SmartTaxiColors.authMuted,
            fontSize: compact ? 12.6 : 14.0,
            height: 1.28,
            fontWeight: FontWeight.w700,
          ),
        ),
      ],
    );
  }
}

class _PhotoSmsFooter extends StatelessWidget {
  const _PhotoSmsFooter();

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final compact = _isCompactAuthViewport(context);
    return Column(
      children: [
        Container(height: 1, color: SmartTaxiColors.authBorder),
        SizedBox(height: compact ? 14 : 18),
        Text(
          l10n.smsCodeValidity,
          textAlign: TextAlign.center,
          style: TextStyle(
            color: SmartTaxiColors.authCaption,
            fontSize: compact ? 10.5 : 12.0,
            height: 1.28,
            fontWeight: FontWeight.w700,
          ),
        ),
        const SizedBox(height: 6),
        Text(
          l10n.smsTermsConsent,
          textAlign: TextAlign.center,
          style: TextStyle(
            color: SmartTaxiColors.authCaption,
            fontSize: compact ? 10.3 : 11.8,
            height: 1.28,
            fontWeight: FontWeight.w700,
          ),
        ),
      ],
    );
  }
}

class _PhotoSmsCodeInput extends StatefulWidget {
  const _PhotoSmsCodeInput({
    required this.controller,
    required this.compact,
    required this.enabled,
    required this.hasError,
    required this.onChanged,
    required this.onSubmitted,
  });

  final TextEditingController controller;
  final bool compact;
  final bool enabled;
  final bool hasError;
  final ValueChanged<String> onChanged;
  final ValueChanged<String>? onSubmitted;

  @override
  State<_PhotoSmsCodeInput> createState() => _PhotoSmsCodeInputState();
}

class _PhotoSmsCodeInputState extends State<_PhotoSmsCodeInput>
    with SingleTickerProviderStateMixin {
  late final FocusNode _focusNode;
  late final AnimationController _shakeController;
  late final Animation<double> _shakeOffset;

  @override
  void initState() {
    super.initState();
    _focusNode = FocusNode();
    _shakeController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 360),
    );
    _shakeOffset = TweenSequence<double>([
      TweenSequenceItem(tween: Tween(begin: 0, end: -7), weight: 1),
      TweenSequenceItem(tween: Tween(begin: -7, end: 7), weight: 2),
      TweenSequenceItem(tween: Tween(begin: 7, end: -5), weight: 2),
      TweenSequenceItem(tween: Tween(begin: -5, end: 4), weight: 2),
      TweenSequenceItem(tween: Tween(begin: 4, end: 0), weight: 1),
    ]).animate(
      CurvedAnimation(parent: _shakeController, curve: Curves.easeOutCubic),
    );
    _focusNode.addListener(_handleFocusChanged);
    widget.controller.addListener(_handleTextChanged);
  }

  @override
  void didUpdateWidget(covariant _PhotoSmsCodeInput oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.controller != widget.controller) {
      oldWidget.controller.removeListener(_handleTextChanged);
      widget.controller.addListener(_handleTextChanged);
    }
    if (!oldWidget.hasError && widget.hasError) {
      _shakeController.forward(from: 0);
    }
  }

  @override
  void dispose() {
    _focusNode.removeListener(_handleFocusChanged);
    _shakeController.dispose();
    _focusNode.dispose();
    widget.controller.removeListener(_handleTextChanged);
    super.dispose();
  }

  void _handleFocusChanged() => setState(() {});

  void _handleTextChanged() {
    if (mounted) setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    final value = widget.controller.text;
    final digits = value.replaceAll(RegExp(r'\D'), '');
    final activeIndex = digits.length.clamp(0, 5).toInt();
    final boxHeight = widget.compact ? 58.0 : 68.0;
    final gap = widget.compact ? 9.0 : 12.0;

    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: widget.enabled ? () => _focusNode.requestFocus() : null,
      child: AnimatedBuilder(
        animation: _shakeController,
        builder: (context, child) => Transform.translate(
          offset: Offset(_shakeOffset.value, 0),
          child: child,
        ),
        child: Stack(
          clipBehavior: Clip.none,
          children: [
            Row(
              children: List.generate(6, (index) {
                final digit = index < digits.length ? digits[index] : null;
                final active = widget.enabled &&
                    index == activeIndex &&
                    (_focusNode.hasFocus || digits.isEmpty);
                return Expanded(
                  child: Padding(
                    padding: EdgeInsets.only(right: index == 5 ? 0 : gap),
                    child: _PhotoSmsCodeBox(
                      height: boxHeight,
                      digit: digit,
                      active: active,
                      hasError: widget.hasError,
                      compact: widget.compact,
                    ),
                  ),
                );
              }),
            ),
            Positioned(
              left: 0,
              bottom: -2,
              child: SizedBox(
                width: 1,
                height: 1,
                child: TextField(
                  controller: widget.controller,
                  focusNode: _focusNode,
                  enabled: widget.enabled,
                  autofocus: false,
                  keyboardType: TextInputType.number,
                  textInputAction: TextInputAction.done,
                  autofillHints: const [AutofillHints.oneTimeCode],
                  inputFormatters: [
                    FilteringTextInputFormatter.digitsOnly,
                    LengthLimitingTextInputFormatter(6),
                  ],
                  style: const TextStyle(
                    color: Colors.transparent,
                    fontSize: 1,
                    height: 1,
                  ),
                  cursorColor: Colors.transparent,
                  decoration: const InputDecoration(
                    border: InputBorder.none,
                    counterText: '',
                    contentPadding: EdgeInsets.zero,
                    isCollapsed: true,
                  ),
                  onChanged: widget.onChanged,
                  onSubmitted: widget.onSubmitted,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _PhotoSmsCodeBox extends StatelessWidget {
  const _PhotoSmsCodeBox({
    required this.height,
    required this.digit,
    required this.active,
    required this.hasError,
    required this.compact,
  });

  final double height;
  final String? digit;
  final bool active;
  final bool hasError;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    return AnimatedContainer(
      duration: const Duration(milliseconds: 150),
      curve: Curves.easeOutCubic,
      child: AnimatedScale(
        duration: const Duration(milliseconds: 160),
        curve: Curves.easeOutCubic,
        scale: active ? 1.035 : 1,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 160),
          curve: Curves.easeOutCubic,
          height: height,
          decoration: BoxDecoration(
            color: hasError ? SmartTaxiColors.dangerSoft : Colors.white,
            borderRadius: BorderRadius.circular(compact ? 13 : 15),
            border: Border.all(
              color: hasError
                  ? const Color(0xffffd4d4)
                  : active
                      ? SmartTaxiColors.brand
                      : SmartTaxiColors.authBorder,
              width: active || hasError ? 1.45 : 1.05,
            ),
            boxShadow: hasError
                ? [
                    BoxShadow(
                      color: SmartTaxiColors.danger.withValues(alpha: 0.14),
                      blurRadius: 16,
                      spreadRadius: -6,
                      offset: const Offset(0, 8),
                    ),
                  ]
                : active
                    ? [
                        BoxShadow(
                          color: SmartTaxiColors.brand.withValues(alpha: 0.24),
                          blurRadius: 18,
                          spreadRadius: -5,
                          offset: const Offset(0, 8),
                        ),
                      ]
                    : null,
          ),
          child: Center(
            child: digit != null
                ? Text(
                    digit!,
                    style: TextStyle(
                      color: SmartTaxiColors.authInk,
                      fontSize: compact ? 23 : 27,
                      height: 1,
                      fontWeight: FontWeight.w900,
                    ),
                  )
                : active
                    ? _PhotoSmsBlinkingCursor(compact: compact)
                    : const SizedBox.shrink(),
          ),
        ),
      ),
    );
  }
}

class _PhotoSmsBlinkingCursor extends StatefulWidget {
  const _PhotoSmsBlinkingCursor({required this.compact});

  final bool compact;

  @override
  State<_PhotoSmsBlinkingCursor> createState() =>
      _PhotoSmsBlinkingCursorState();
}

class _PhotoSmsBlinkingCursorState extends State<_PhotoSmsBlinkingCursor>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;
  late final Animation<double> _opacity;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 860),
    )..repeat(reverse: true);
    _opacity = CurvedAnimation(parent: _controller, curve: Curves.easeInOut);
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return FadeTransition(
      opacity: _opacity,
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Container(
            width: 2,
            height: widget.compact ? 23 : 28,
            decoration: BoxDecoration(
              color: SmartTaxiColors.authCaption,
              borderRadius: BorderRadius.circular(2),
            ),
          ),
        ],
      ),
    );
  }
}

class _PhotoSmsResendRow extends StatelessWidget {
  const _PhotoSmsResendRow({
    required this.compact,
    required this.loading,
    required this.remaining,
    required this.countdownLabel,
    required this.onResend,
  });

  final bool compact;
  final bool loading;
  final int remaining;
  final String countdownLabel;
  final VoidCallback? onResend;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final canResend = remaining == 0 && onResend != null && !loading;
    return Material(
      color: Colors.transparent,
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: canResend ? onResend : null,
        child: Padding(
          padding: EdgeInsets.symmetric(
            horizontal: compact ? 2 : 8,
            vertical: compact ? 8 : 10,
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(
                Icons.schedule_rounded,
                color: SmartTaxiColors.brand,
                size: compact ? 18 : 21,
              ),
              SizedBox(width: compact ? 8 : 10),
              Flexible(
                child: Text(
                  canResend ? l10n.smsResendCode : l10n.smsResendCountdown,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    color: SmartTaxiColors.authMuted,
                    fontSize: compact ? 13.2 : 15.2,
                    height: 1.2,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
              if (!canResend) ...[
                const SizedBox(width: 8),
                Text(
                  countdownLabel,
                  style: TextStyle(
                    color: SmartTaxiColors.brand,
                    fontSize: compact ? 13.8 : 15.8,
                    height: 1.2,
                    fontWeight: FontWeight.w900,
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _BrandLoader extends StatefulWidget {
  const _BrandLoader({this.size = 42});

  final double size;

  @override
  State<_BrandLoader> createState() => _BrandLoaderState();
}

class _BrandLoaderState extends State<_BrandLoader>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1050),
    )..repeat();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    // Three softly pulsing dots instead of a generic Material spinner ring —
    // reads as a deliberate, branded loading state next to the photo-hero
    // welcome screen rather than a stock "still loading" widget.
    final dotSize = widget.size / 4.2;
    return SizedBox(
      width: widget.size,
      height: dotSize,
      child: AnimatedBuilder(
        animation: _controller,
        builder: (context, child) {
          return Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: List.generate(3, (i) {
              final t = (_controller.value - i * 0.18) % 1.0;
              final bump = t < 0.5 ? (t / 0.5) : (1 - (t - 0.5) / 0.5);
              return Opacity(
                opacity: 0.32 + bump * 0.68,
                child: Transform.scale(
                  scale: 0.55 + bump * 0.45,
                  child: Container(
                    width: dotSize,
                    height: dotSize,
                    decoration: const BoxDecoration(
                      color: SmartTaxiColors.brand,
                      shape: BoxShape.circle,
                    ),
                  ),
                ),
              );
            }),
          );
        },
      ),
    );
  }
}

class _OfflineOverlay extends StatelessWidget {
  const _OfflineOverlay({required this.onRetry});

  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Material(
      color: SmartTaxiColors.appBackground,
      child: SafeArea(
        child: Center(
          child: Padding(
            padding: const EdgeInsets.all(28),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  width: 84,
                  height: 84,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: SmartTaxiColors.brandPale,
                    shape: BoxShape.circle,
                  ),
                  child: const Icon(
                    Icons.wifi_off_rounded,
                    color: SmartTaxiColors.brandDeep,
                    size: 40,
                  ),
                ),
                const SizedBox(height: 20),
                Text(
                  l10n.offlineTitle,
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                    color: SmartTaxiColors.authInk,
                    fontSize: 20,
                    fontWeight: FontWeight.w900,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  l10n.offlineBody,
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                    color: SmartTaxiColors.authMuted,
                    fontSize: 14,
                    height: 1.4,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 22),
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton.icon(
                    onPressed: onRetry,
                    icon: const Icon(Icons.refresh_rounded),
                    label: Text(l10n.offlineRetryLabel),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

// Hard gate: covers the whole app, no back/close/dismiss action at all.
// Only shown when the installed build is older than the backend's
// APP_MIN_SUPPORTED_VERSION (main.dart's _versionInfo.updateRequired).
class _UpdateRequiredScreen extends StatelessWidget {
  const _UpdateRequiredScreen({required this.info, required this.onUpdate});

  final AppVersionInfo info;
  final VoidCallback onUpdate;

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: false,
      child: Material(
        color: SmartTaxiColors.appBackground,
        child: SafeArea(
          child: Center(
            child: Padding(
              padding: const EdgeInsets.all(28),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const BrandLogo(large: true),
                  const SizedBox(height: 24),
                  Container(
                    width: 84,
                    height: 84,
                    alignment: Alignment.center,
                    decoration: const BoxDecoration(
                      color: SmartTaxiColors.brandPale,
                      shape: BoxShape.circle,
                    ),
                    child: const Icon(
                      Icons.system_update_rounded,
                      color: SmartTaxiColors.brandDeep,
                      size: 40,
                    ),
                  ),
                  const SizedBox(height: 20),
                  const Text(
                    'Нужно обновить приложение',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      color: SmartTaxiColors.authInk,
                      fontSize: 20,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    (info.updateNotes?.trim().isNotEmpty ?? false)
                        ? info.updateNotes!.trim()
                        : 'Вышла новая версия SmartTaxi. Эта версия '
                            'больше не поддерживается — обновите '
                            'приложение, чтобы продолжить пользоваться.',
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                      color: SmartTaxiColors.authMuted,
                      fontSize: 14,
                      height: 1.4,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: 22),
                  SizedBox(
                    width: double.infinity,
                    child: ElevatedButton.icon(
                      onPressed: onUpdate,
                      icon: const Icon(Icons.system_update_rounded),
                      label: const Text('Обновить'),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

// Soft nudge: dismissible bottom sheet shown once per launch when a newer
// version exists but the installed one still works fine (updateAvailable
// without updateRequired) — "Позже" just closes it, no repeat within the
// same app run (see main.dart's _updateNudgeShown).
class _UpdateAvailableSheet extends StatelessWidget {
  const _UpdateAvailableSheet({required this.info, required this.onUpdate});

  final AppVersionInfo info;
  final VoidCallback onUpdate;

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      top: false,
      child: Container(
        margin: const EdgeInsets.all(12),
        padding: const EdgeInsets.fromLTRB(20, 14, 20, 20),
        decoration: BoxDecoration(
          color: Colors.white,
          border: Border.all(
            color: SmartTaxiColors.brand.withValues(alpha: 0.32),
          ),
          borderRadius: BorderRadius.circular(30),
          boxShadow: const [
            BoxShadow(
              color: Color(0x20102a52),
              blurRadius: 34,
              offset: Offset(0, 16),
            ),
          ],
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  width: 48,
                  height: 48,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: SmartTaxiColors.brandPale,
                    borderRadius: BorderRadius.circular(18),
                  ),
                  child: const Icon(
                    Icons.system_update_rounded,
                    color: SmartTaxiColors.brandDeep,
                    size: 24,
                  ),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'Доступно обновление',
                        style: TextStyle(
                          color: SmartTaxiColors.text,
                          fontSize: 18,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        (info.updateNotes?.trim().isNotEmpty ?? false)
                            ? info.updateNotes!.trim()
                            : 'Новая версия ${info.latestVersion} уже '
                                'доступна.',
                        style: const TextStyle(
                          color: SmartTaxiColors.textSecondary,
                          fontSize: 13,
                          height: 1.3,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 18),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: () => Navigator.pop(context),
                    child: const Text('Позже'),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: ElevatedButton(
                    onPressed: onUpdate,
                    child: const Text('Обновить'),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _RuntimeFallbackScreen extends StatelessWidget {
  const _RuntimeFallbackScreen();

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Material(
      color: SmartTaxiColors.appBackground,
      child: SafeArea(
        child: Center(
          child: Padding(
            padding: const EdgeInsets.all(20),
            child: _PremiumCard(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const _RuntimeFallbackLogo(),
                  const SizedBox(height: 18),
                  const Text(
                    'SmartTaxi',
                    style: TextStyle(fontSize: 28, fontWeight: FontWeight.w900),
                  ),
                  const SizedBox(height: 10),
                  Text(
                    l10n.runtimeFallbackBody,
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                      color: SmartTaxiColors.textSecondary,
                      height: 1.4,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: 18),
                  SizedBox(
                    width: double.infinity,
                    child: OutlinedButton(
                      onPressed: () => Navigator.of(context).maybePop(),
                      child: Text(l10n.runtimeFallbackAction),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _RuntimeFallbackLogo extends StatelessWidget {
  const _RuntimeFallbackLogo();

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 88,
      height: 88,
      decoration: BoxDecoration(
        color: SmartTaxiColors.brand,
        shape: BoxShape.circle,
        border: Border.all(color: SmartTaxiColors.brandDeep, width: 6),
      ),
      child: const Icon(
        Icons.near_me_rounded,
        color: Colors.white,
        size: 46,
      ),
    );
  }
}

class _ButtonLoader extends StatelessWidget {
  const _ButtonLoader({required this.text});

  final String text;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        const SizedBox(
          width: 18,
          height: 18,
          child:
              CircularProgressIndicator(strokeWidth: 2.2, color: Colors.white),
        ),
        const SizedBox(width: 10),
        Text(
          text,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: const TextStyle(
            color: Colors.white,
            fontSize: 16,
            fontWeight: FontWeight.w900,
          ),
        ),
      ],
    );
  }
}

/// Shared entrance transition for auth-flow error/info banners: fade + a
/// short drop-in from above, instead of the flat cross-fade AnimatedSwitcher
/// uses by default. Keeping this in one place means every step (phone, SMS,
/// password, new-password) presents feedback the same, deliberate way.
Widget _authFeedbackTransitionBuilder(
    Widget child, Animation<double> animation) {
  final offset = Tween<Offset>(
    begin: const Offset(0, -0.12),
    end: Offset.zero,
  ).animate(animation);
  return FadeTransition(
    opacity: animation,
    child: SlideTransition(position: offset, child: child),
  );
}

class _SplashScreen extends StatelessWidget {
  const _SplashScreen();

  @override
  Widget build(BuildContext context) {
    // Deliberately no photo/bitmap background here: a full-screen image
    // decode + BoxFit.cover is one of the more expensive things a low-end
    // phone can do on first frame. This screen is pure vector/text, so it
    // costs next to nothing to paint regardless of device class.
    return const Scaffold(
      backgroundColor: SmartTaxiColors.appBackground,
      body: DecoratedBox(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [
              Colors.white,
              SmartTaxiColors.brandSurface,
            ],
          ),
        ),
        child: _SplashContent(),
      ),
    );
  }
}

class _SplashContent extends StatelessWidget {
  const _SplashContent();

  // Matches the native Android launch_background bitmap exactly (same PNG,
  // same 260x260 size, same dead-center placement) — swapping in a
  // different-looking logo or moving it here would read as two different
  // loading screens flashing one after the other the instant Flutter takes
  // over from the native splash. The background tone is the same fixed
  // reason: android/.../colors.xml#smarttaxi_background is this exact
  // #F7FBFF, so only *additive* depth (glow, shadow) is safe here — anything
  // that changes the base tone would flash when Flutter attaches.
  static const _logoSize = 260.0;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return TweenAnimationBuilder<double>(
      tween: Tween(begin: 0.92, end: 1),
      duration: const Duration(milliseconds: 420),
      curve: Curves.easeOutCubic,
      builder: (context, value, child) => Opacity(
        opacity: value.clamp(0.0, 1.0),
        child: Transform.scale(scale: value, child: child),
      ),
      child: LayoutBuilder(
        builder: (context, constraints) {
          // The logo is pinned dead-center via Align, matching exactly
          // where the native Android launch_background bitmap sits
          // (gravity="center") — so there's no visible jump when this
          // widget takes over from the native splash. Everything else is
          // anchored a fixed distance *below* that fixed point instead of
          // living inside a mainAxisAlignment.center Column, so adding the
          // tagline/loader/label never shifts the logo itself.
          final belowLogoTop = constraints.maxHeight / 2 + _logoSize / 2 + 14;
          final aboveLogoBottom = constraints.maxHeight / 2 - _logoSize / 2;
          return Stack(
            fit: StackFit.expand,
            children: [
              // Soft radial glow in the brand blue behind the icon — pure
              // depth, doesn't touch the edges/corners so it never collides
              // with the native splash's flat background tone there.
              Align(
                alignment: Alignment.center,
                child: Container(
                  width: _logoSize * 1.55,
                  height: _logoSize * 1.55,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    gradient: RadialGradient(
                      colors: [
                        SmartTaxiColors.brand.withValues(alpha: 0.16),
                        SmartTaxiColors.brand.withValues(alpha: 0.0),
                      ],
                    ),
                  ),
                ),
              ),
              Align(
                alignment: Alignment.center,
                child: Container(
                  width: _logoSize,
                  height: _logoSize,
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(58),
                    boxShadow: [
                      BoxShadow(
                        color: SmartTaxiColors.brandDeep.withValues(alpha: 0.22),
                        blurRadius: 48,
                        offset: const Offset(0, 22),
                      ),
                    ],
                  ),
                  child: const Image(
                    image: AssetImage(BrandLogo.iconAssetPath),
                  ),
                ),
              ),
              Positioned(
                left: 0,
                right: 0,
                top: aboveLogoBottom - 34,
                child: Center(
                  child: Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
                    decoration: BoxDecoration(
                      color: SmartTaxiColors.brandSurface,
                      borderRadius: BorderRadius.circular(999),
                    ),
                    child: Text(
                      l10n.appTagline,
                      textAlign: TextAlign.center,
                      style: const TextStyle(
                        color: SmartTaxiColors.brandDeep,
                        fontSize: 12,
                        height: 1.2,
                        fontWeight: FontWeight.w800,
                        letterSpacing: 0.1,
                      ),
                    ),
                  ),
                ),
              ),
              Positioned(
                left: 0,
                right: 0,
                top: belowLogoTop,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const _BrandLoader(size: 40),
                    const SizedBox(height: 16),
                    Text(
                      l10n.loading,
                      textAlign: TextAlign.center,
                      style: const TextStyle(
                        color: SmartTaxiColors.authMuted,
                        fontSize: 15.2,
                        height: 1.15,
                        fontWeight: FontWeight.w800,
                        letterSpacing: 0,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}

// Auth-flow feedback (errors/validation) is stored as a *kind*, not resolved
// text, so switching the language re-renders it in the new language instead
// of freezing whatever locale was active when the message first appeared.
enum _AuthMessageKind {
  validateEnterName,
  validateEnterPhone,
  validateCorrectPhone,
  validateSmsCode,
  validateConfirmPhoneFirst,
  validateEnterPassword,
  validateEnterNewPassword,
  passwordHintMinChars,
  passwordAddLettersDigits,
  repeatPasswordLabel,
  passwordsMismatch,
  invalidSmsCode,
  serverUnavailable,
  smsConfirmFailed,
  invalidPhoneOrPassword,
  phoneAlreadyRegistered,
  driverAccountBlocked,
  passwordMinLength,
  checkFilledData,
  sessionExpiredOtherDevice,
}

String _resolveAuthMessage(_AuthMessageKind kind, AppLocalizations l10n) {
  switch (kind) {
    case _AuthMessageKind.validateEnterName:
      return l10n.validateEnterName;
    case _AuthMessageKind.validateEnterPhone:
      return l10n.validateEnterPhone;
    case _AuthMessageKind.validateCorrectPhone:
      return l10n.validateCorrectPhone;
    case _AuthMessageKind.validateSmsCode:
      return l10n.validateSmsCode;
    case _AuthMessageKind.validateConfirmPhoneFirst:
      return l10n.validateConfirmPhoneFirst;
    case _AuthMessageKind.validateEnterPassword:
      return l10n.validateEnterPassword;
    case _AuthMessageKind.validateEnterNewPassword:
      return l10n.validateEnterNewPassword;
    case _AuthMessageKind.passwordHintMinChars:
      return l10n.passwordHintMinChars;
    case _AuthMessageKind.passwordAddLettersDigits:
      return l10n.passwordAddLettersDigits;
    case _AuthMessageKind.repeatPasswordLabel:
      return l10n.repeatPasswordLabel;
    case _AuthMessageKind.passwordsMismatch:
      return l10n.passwordsMismatch;
    case _AuthMessageKind.invalidSmsCode:
      return l10n.invalidSmsCode;
    case _AuthMessageKind.serverUnavailable:
      return l10n.serverUnavailable;
    case _AuthMessageKind.smsConfirmFailed:
      return l10n.smsConfirmFailed;
    case _AuthMessageKind.invalidPhoneOrPassword:
      return l10n.invalidPhoneOrPassword;
    case _AuthMessageKind.phoneAlreadyRegistered:
      return l10n.phoneAlreadyRegistered;
    case _AuthMessageKind.driverAccountBlocked:
      return l10n.driverAccountBlocked;
    case _AuthMessageKind.passwordMinLength:
      return l10n.passwordMinLength;
    case _AuthMessageKind.checkFilledData:
      return l10n.checkFilledData;
    case _AuthMessageKind.sessionExpiredOtherDevice:
      return l10n.sessionExpiredOtherDevice;
  }
}

class _PhotoAuthScreen extends StatefulWidget {
  const _PhotoAuthScreen({
    required this.api,
    required this.onLoggedIn,
    required this.currentLocale,
    required this.onChangeLocale,
    this.initialError,
  });

  final ApiClient api;
  final Future<void> Function(Map<String, dynamic>) onLoggedIn;
  final Locale? currentLocale;
  final ValueChanged<Locale> onChangeLocale;
  final _AuthMessageKind? initialError;

  @override
  State<_PhotoAuthScreen> createState() => _PhotoAuthScreenState();
}

class _PhotoAuthScreenState extends State<_PhotoAuthScreen> {
  final _nameController = TextEditingController();
  final _phoneController = TextEditingController();
  final _smsCodeController = TextEditingController();
  final _passwordController = TextEditingController();
  final _passwordRepeatController = TextEditingController();
  final _referralCodeController = TextEditingController();
  final _exitGuard = ExitOnDoubleBack();

  bool _registerMode = false;
  bool _phoneChecked = false;
  bool _smsStep = false;
  bool _resetSmsStep = false;
  bool _resetPasswordStep = false;
  bool _loading = false;
  bool _showPassword = false;
  bool _showPasswordRepeat = false;
  Timer? _smsCountdownTimer;
  int _smsResendRemaining = 0;
  _AuthMessageKind? _error;
  String? _devCode;
  String? _verifiedPhone;
  String? _verificationToken;

  @override
  void initState() {
    super.initState();
    _error = widget.initialError;
  }

  // Resolved lazily from the stored *kind*/raw value on every build, so a
  // language switch re-renders existing feedback in the new locale instead
  // of leaving it frozen in whatever language was active when it appeared.
  String? get _errorText {
    final kind = _error;
    if (kind == null) return null;
    return _resolveAuthMessage(kind, AppLocalizations.of(context));
  }

  String? get _infoText {
    final devCode = _devCode;
    if (devCode == null) return null;
    return AppLocalizations.of(context).devCodeLabel(devCode);
  }

  @override
  void dispose() {
    _smsCountdownTimer?.cancel();
    _nameController.dispose();
    _phoneController.dispose();
    _smsCodeController.dispose();
    _passwordController.dispose();
    _passwordRepeatController.dispose();
    _referralCodeController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final validationError = _validate();
    if (validationError != null) {
      setState(() => _error = validationError);
      return;
    }
    setState(() {
      _loading = true;
      _error = null;
      _devCode = null;
    });
    try {
      if (!_phoneChecked &&
          !_smsStep &&
          !_resetSmsStep &&
          !_resetPasswordStep &&
          !_registerMode) {
        final phone = _normalizePhone(_phoneController.text);
        final phoneState = await widget.api.checkAuthPhone(phone);
        final normalizedPhone = (phoneState['phone'] ?? phone).toString();
        if (phoneState['exists'] == true) {
          setState(() {
            _verifiedPhone = normalizedPhone;
            _phoneChecked = true;
            _passwordController.clear();
            _showPassword = false;
          });
          return;
        }
        final sms = await widget.api.sendAuthSms(normalizedPhone);
        final devCode = sms['devCode'];
        setState(() {
          _verifiedPhone = (sms['phone'] ?? normalizedPhone).toString();
          _smsStep = true;
          _smsCodeController.clear();
          _devCode = devCode?.toString();
        });
        _startSmsCountdown();
        return;
      }
      if (_resetSmsStep) {
        final verified = await widget.api.verifyAuthSms(
          phone: _verifiedPhone ?? _normalizePhone(_phoneController.text),
          code: _smsCodeController.text.trim(),
          purpose: 'RESET_PASSWORD',
        );
        setState(() {
          _resetSmsStep = false;
          _resetPasswordStep = true;
          _verificationToken = verified['verificationToken']?.toString() ?? '';
          _passwordController.clear();
          _passwordRepeatController.clear();
          _showPassword = false;
          _showPasswordRepeat = false;
        });
        return;
      }
      if (_smsStep) {
        final verified = await widget.api.verifyAuthSms(
          phone: _verifiedPhone ?? _normalizePhone(_phoneController.text),
          code: _smsCodeController.text.trim(),
        );
        setState(() {
          _smsStep = false;
          _registerMode = true;
          _verificationToken = verified['verificationToken']?.toString() ?? '';
          _passwordController.clear();
          _passwordRepeatController.clear();
          _showPassword = false;
          _showPasswordRepeat = false;
        });
        return;
      }
      if (_resetPasswordStep) {
        final payload = await widget.api.confirmPasswordReset(
          phone: _verifiedPhone ?? _normalizePhone(_phoneController.text),
          verificationToken: _verificationToken ?? '',
          password: _passwordController.text,
        );
        await widget.onLoggedIn(payload);
        return;
      }
      final payload = _registerMode
          ? await _register()
          : await widget.api.login(
              phone: _verifiedPhone ?? _normalizePhone(_phoneController.text),
              password: _passwordController.text,
            );
      await widget.onLoggedIn(payload);
    } catch (error) {
      setState(() =>
          _error = _smsStep ? _smsAuthError(error) : _photoAuthError(error));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<Map<String, dynamic>> _register() async {
    final fullName = _nameController.text.trim();
    final referralCode = _referralCodeController.text.trim();
    final payload = await widget.api.registerWithPassword(
      name: fullName,
      phone: _verifiedPhone ?? _normalizePhone(_phoneController.text),
      verificationToken: _verificationToken ?? '',
      password: _passwordController.text,
      referralCode: referralCode.isEmpty ? null : referralCode,
    );
    final user = payload['user'];
    if (user is Map) {
      payload['user'] = {
        ...Map<String, dynamic>.from(user),
        'name': fullName,
      };
    }
    return payload;
  }

  _AuthMessageKind? _validate() {
    final phoneDigits = _phoneDigits(_phoneController.text);
    final password = _passwordController.text;
    if (_registerMode && _nameController.text.trim().isEmpty) {
      return _AuthMessageKind.validateEnterName;
    }
    if (_phoneController.text.trim().isEmpty) {
      return _AuthMessageKind.validateEnterPhone;
    }
    if (phoneDigits.length < 10) return _AuthMessageKind.validateCorrectPhone;
    // Kazakhstan mobile numbers only — the SMS provider can't deliver
    // outside Kazakhstan, and the backend rejects anything else anyway, so
    // catch it here before a network round-trip.
    if (!RegExp(r'^\+77\d{9}$')
        .hasMatch(_normalizePhone(_phoneController.text))) {
      return _AuthMessageKind.validateCorrectPhone;
    }
    if (!_phoneChecked &&
        !_smsStep &&
        !_resetSmsStep &&
        !_resetPasswordStep &&
        !_registerMode) {
      return null;
    }
    if ((_smsStep || _resetSmsStep) &&
        _smsCodeController.text.trim().length < 6) {
      return _AuthMessageKind.validateSmsCode;
    }
    if (_smsStep || _resetSmsStep) {
      return null;
    }
    if (_resetPasswordStep) {
      if ((_verificationToken ?? '').isEmpty) {
        return _AuthMessageKind.validateConfirmPhoneFirst;
      }
      return _newPasswordValidationError(
        password,
        _passwordRepeatController.text,
      );
    }
    if (_registerMode) {
      if ((_verificationToken ?? '').isEmpty) {
        return _AuthMessageKind.validateConfirmPhoneFirst;
      }
      return _newPasswordValidationError(
        password,
        _passwordRepeatController.text,
      );
    }
    if (password.isEmpty) return _AuthMessageKind.validateEnterPassword;
    return null;
  }

  // Shared by registration and password-reset: both flows are creating a
  // fresh password, so both get the same strength rule. Login keeps the
  // lighter check above since it's just authenticating an existing account.
  _AuthMessageKind? _newPasswordValidationError(
      String password, String repeat) {
    if (password.isEmpty) return _AuthMessageKind.validateEnterNewPassword;
    if (password.length < 8) {
      return _AuthMessageKind.passwordHintMinChars;
    }
    final hasLetter = RegExp(r'[A-Za-zА-Яа-я]').hasMatch(password);
    final hasDigit = RegExp(r'\d').hasMatch(password);
    if (!hasLetter || !hasDigit) {
      return _AuthMessageKind.passwordAddLettersDigits;
    }
    if (repeat.isEmpty) return _AuthMessageKind.repeatPasswordLabel;
    if (password != repeat) return _AuthMessageKind.passwordsMismatch;
    return null;
  }

  Future<void> _resendSms() async {
    if (_loading) return;
    setState(() {
      _loading = true;
      _error = null;
      _devCode = null;
    });
    try {
      final phone = _verifiedPhone ?? _normalizePhone(_phoneController.text);
      final sms = _resetSmsStep
          ? await widget.api.requestPasswordReset(phone)
          : await widget.api.sendAuthSms(phone);
      final devCode = sms['devCode'];
      setState(() {
        _devCode = devCode?.toString();
      });
      _startSmsCountdown();
    } catch (error) {
      setState(() => _error = _photoAuthError(error));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _backToPhone() {
    _smsCountdownTimer?.cancel();
    setState(() {
      _registerMode = false;
      _phoneChecked = false;
      _smsStep = false;
      _resetSmsStep = false;
      _resetPasswordStep = false;
      _error = null;
      _devCode = null;
      _verifiedPhone = null;
      _verificationToken = null;
      _smsCodeController.clear();
      _passwordController.clear();
      _passwordRepeatController.clear();
      _showPassword = false;
      _showPasswordRepeat = false;
      _smsResendRemaining = 0;
    });
  }

  void _startSmsCountdown([int seconds = 83]) {
    _smsCountdownTimer?.cancel();
    if (!mounted) return;
    setState(() => _smsResendRemaining = seconds);
    _smsCountdownTimer = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (!mounted) {
        timer.cancel();
        return;
      }
      if (_smsResendRemaining <= 1) {
        timer.cancel();
        setState(() => _smsResendRemaining = 0);
        return;
      }
      setState(() => _smsResendRemaining -= 1);
    });
  }

  String _smsCountdownLabel() {
    final minutes = _smsResendRemaining ~/ 60;
    final seconds = _smsResendRemaining % 60;
    return '${minutes.toString().padLeft(2, '0')}:${seconds.toString().padLeft(2, '0')}';
  }

  void _clearFeedbackOnEdit(String _) {
    if (_error == null && _devCode == null) return;
    setState(() {
      _error = null;
      _devCode = null;
    });
  }

  _AuthMessageKind _smsAuthError(Object error) {
    final message = error.toString();
    if (message.contains('SMS') ||
        message.contains('CODE') ||
        message.contains('INVALID') ||
        message.contains('400') ||
        message.contains('401') ||
        message.contains('403')) {
      return _AuthMessageKind.invalidSmsCode;
    }
    if (message.contains('SocketException') ||
        message.contains('DioException') ||
        message.contains('DioError') ||
        message.contains('connection error') ||
        message.contains('Connection error') ||
        message.contains('Connection refused') ||
        message.contains('Failed host lookup') ||
        message.contains('timed out') ||
        message.contains('Network is unreachable')) {
      return _AuthMessageKind.serverUnavailable;
    }
    return _AuthMessageKind.smsConfirmFailed;
  }

  _AuthMessageKind _photoAuthError(Object error) {
    final message = error.toString();
    if (message.contains('INVALID_CREDENTIALS') ||
        message.contains('401') ||
        message.contains('403')) {
      return _AuthMessageKind.invalidPhoneOrPassword;
    }
    if (message.contains('PHONE_EXISTS') ||
        message.contains('USER_ALREADY_EXISTS')) {
      return _AuthMessageKind.phoneAlreadyRegistered;
    }
    if (message.contains('DRIVER_BLOCKED')) {
      return _AuthMessageKind.driverAccountBlocked;
    }
    if (message.contains('NAME_REQUIRED')) {
      return _AuthMessageKind.validateEnterName;
    }
    if (message.contains('PHONE_REQUIRED')) {
      return _AuthMessageKind.validateEnterPhone;
    }
    if (message.contains('PASSWORD_TOO_SHORT')) {
      return _AuthMessageKind.passwordMinLength;
    }
    if (message.contains('PASSWORD_MISMATCH')) {
      return _AuthMessageKind.passwordsMismatch;
    }
    if (message.contains('SocketException') ||
        message.contains('DioException') ||
        message.contains('DioError') ||
        message.contains('connection error') ||
        message.contains('Connection error') ||
        message.contains('Connection refused') ||
        message.contains('Failed host lookup') ||
        message.contains('timed out') ||
        message.contains('Network is unreachable')) {
      return _AuthMessageKind.serverUnavailable;
    }
    return _AuthMessageKind.checkFilledData;
  }

  @override
  Widget build(BuildContext context) {
    final size = MediaQuery.sizeOf(context);
    final keyboardOpen = MediaQuery.viewInsetsOf(context).bottom > 0;
    final compact = size.height < 840 || size.width < 390;
    final Widget screen;
    if (_smsStep || _resetSmsStep) {
      screen = _buildSmsScreen(
        context,
        size: size,
        compact: compact,
        keyboardOpen: keyboardOpen,
      );
    } else if (_resetPasswordStep) {
      screen = _buildNewPasswordScreen(
        context,
        size: size,
        compact: compact,
        keyboardOpen: keyboardOpen,
      );
    } else if (_phoneChecked) {
      screen = _buildPasswordScreen(
        context,
        size: size,
        compact: compact,
        keyboardOpen: keyboardOpen,
      );
    } else {
      screen = _buildWelcomeScreen(
        context,
        size: size,
        compact: compact,
        keyboardOpen: keyboardOpen,
      );
    }
    // Every step except the very first phone-entry screen has a visible
    // in-app back arrow that calls _backToPhone(); route the OS/gesture
    // back action to the same handler so it doesn't just exit the app. On
    // the true root (phone entry) offer a double-back-to-exit instead of
    // quitting on a single accidental press.
    final canStepBack = _registerMode ||
        _phoneChecked ||
        _smsStep ||
        _resetSmsStep ||
        _resetPasswordStep;
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, result) {
        if (didPop || _loading) return;
        if (canStepBack) {
          _backToPhone();
          return;
        }
        _exitGuard.handle(context);
      },
      child: screen,
    );
  }

  Widget _buildWelcomeScreen(
    BuildContext context, {
    required Size size,
    required bool compact,
    required bool keyboardOpen,
  }) {
    final heroHeight = kAuthHeroHeight(size);
    final panelLift = compact ? 6.0 : 12.0;
    final panelOverlap = compact ? 14.0 : 20.0;
    // The register/create-password step has three fields plus a password
    // rules card plus a "back to SMS" link on top of the button and
    // footer that the login step doesn't have — pull the panel up further
    // so the button lands on screen without needing a scroll to reach it.
    final registerExtraLift = _registerMode ? (compact ? 96.0 : 118.0) : 0.0;
    final panelTop = (heroHeight - panelLift - panelOverlap - registerExtraLift)
        .clamp(64.0, size.height * 0.62)
        .toDouble();
    final l10n = AppLocalizations.of(context);
    final fieldGap = compact || _registerMode ? 8.0 : 12.0;
    final title =
        _registerMode ? l10n.createPasswordTitle : l10n.authWelcomeTitle;
    final subtitle =
        _registerMode ? l10n.createPasswordSubtitle : l10n.authWelcomeSubtitle;
    final buttonLabel =
        _registerMode ? l10n.createAccountButton : l10n.continueLabel;
    final loadingLabel =
        _registerMode ? l10n.creatingLabel : l10n.authCheckingLabel;

    return Scaffold(
      resizeToAvoidBottomInset: false,
      backgroundColor: Colors.white,
      body: Stack(
        children: [
          const _AuthBackdrop(),
          SafeArea(
            bottom: false,
            child: Align(
              alignment: Alignment.topRight,
              child: Padding(
                padding: const EdgeInsets.only(right: 16, top: 6),
                child: _PhotoAuthLanguageToggle(
                  currentLocale: widget.currentLocale,
                  onChanged: widget.onChangeLocale,
                ),
              ),
            ),
          ),
          SafeArea(
            top: false,
            bottom: false,
            child: LayoutBuilder(
              builder: (context, constraints) {
                final horizontalPadding = compact ? 30.0 : 38.0;
                final topPadding = compact ? 44.0 : 52.0;
                final bottomPadding = (compact ? 12.0 : 18.0) +
                    MediaQuery.paddingOf(context).bottom;
                // Derived from the real keyboard height (capped at the
                // previously hand-tuned max) instead of a flat constant, so
                // the panel shifts correctly on keyboards shorter or taller
                // than whatever device the old fixed offset was tuned on.
                final keyboardInset = MediaQuery.viewInsetsOf(context).bottom;
                final maxKeyboardShift = compact ? 108.0 : 118.0;
                final keyboardShift = keyboardOpen
                    ? -(keyboardInset * 0.4).clamp(0.0, maxKeyboardShift)
                    : 0.0;
                // The SMS-consent line only makes sense before a code has
                // been requested — an existing user entering their password
                // (_phoneChecked) or a verified reset entering a new password
                // (_resetPasswordStep) will never trigger an SMS send here.
                final showDefaultFooter =
                    !_registerMode && !_phoneChecked && !_resetPasswordStep;

                return Stack(
                  children: [
                    Positioned(
                      left: 0,
                      right: 0,
                      top: panelTop,
                      bottom: 0,
                      // The card is white and so is the Scaffold behind
                      // it — the card only has rounded *top* corners, so
                      // wherever its content ends, the flat white left
                      // below it is visually identical to plain Scaffold
                      // background either way. Shrinking the *widget*
                      // can't change what's on screen; the actual fix is
                      // heroHeight below leaving less room for that white
                      // area to exist in the first place.
                      child: TweenAnimationBuilder<double>(
                        tween: Tween<double>(end: keyboardShift),
                        duration: const Duration(milliseconds: 210),
                        curve: Curves.easeOutCubic,
                        builder: (context, shift, child) {
                          return Transform.translate(
                            offset: Offset(0, shift),
                            child: child,
                          );
                        },
                        child: GestureDetector(
                          behavior: HitTestBehavior.translucent,
                          onTap: () => FocusScope.of(context).unfocus(),
                          child: Container(
                            width: double.infinity,
                            padding: EdgeInsets.fromLTRB(
                              horizontalPadding,
                              topPadding,
                              horizontalPadding,
                              bottomPadding,
                            ),
                            decoration: BoxDecoration(
                              color: Colors.white,
                              borderRadius: BorderRadius.vertical(
                                  top: Radius.circular(compact ? 34 : 42)),
                              boxShadow: SmartTaxiShadows.sheet,
                            ),
                            child: SingleChildScrollView(
                              physics: const ClampingScrollPhysics(),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.stretch,
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Text(
                                    title,
                                    style: TextStyle(
                                      color: SmartTaxiColors.authInk,
                                      fontSize: compact ? 26.0 : 30.0,
                                      height: 1.05,
                                      fontWeight: FontWeight.w900,
                                      letterSpacing: -0.3,
                                    ),
                                  ),
                                  const SizedBox(height: 8),
                                  Text(
                                    subtitle,
                                    style: TextStyle(
                                      color: SmartTaxiColors.authMuted,
                                      fontSize: compact ? 13.0 : 15.0,
                                      height: compact ? 1.25 : 1.35,
                                      fontWeight: FontWeight.w700,
                                    ),
                                  ),
                                  SizedBox(height: compact ? 15 : 21),
                                  AutofillGroup(
                                    child: Column(
                                      children: [
                                        AnimatedSwitcher(
                                          duration:
                                              const Duration(milliseconds: 220),
                                          switchInCurve: Curves.easeOutCubic,
                                          switchOutCurve: Curves.easeInCubic,
                                          child: _registerMode
                                              ? Column(
                                                  key: const ValueKey(
                                                      'register'),
                                                  children: [
                                                    _PhotoAuthTextField(
                                                      controller:
                                                          _nameController,
                                                      label:
                                                          l10n.nameFieldLabel,
                                                      icon: Icons.badge_rounded,
                                                      onChanged:
                                                          _clearFeedbackOnEdit,
                                                      autofillHints: const [
                                                        AutofillHints.name
                                                      ],
                                                      keyboardType:
                                                          TextInputType.name,
                                                      textCapitalization:
                                                          TextCapitalization
                                                              .words,
                                                    ),
                                                    SizedBox(height: fieldGap),
                                                    _PhotoAuthTextField(
                                                      controller:
                                                          _referralCodeController,
                                                      label: l10n
                                                          .referralCodeFieldLabel,
                                                      icon: Icons
                                                          .card_giftcard_rounded,
                                                      onChanged:
                                                          _clearFeedbackOnEdit,
                                                      keyboardType:
                                                          TextInputType.text,
                                                      textCapitalization:
                                                          TextCapitalization
                                                              .characters,
                                                    ),
                                                  ],
                                                )
                                              : _PhotoPhoneField(
                                                  key: const ValueKey('login'),
                                                  controller: _phoneController,
                                                  onChanged:
                                                      _clearFeedbackOnEdit,
                                                  onSubmitted: _loading
                                                      ? null
                                                      : (_) => _submit(),
                                                ),
                                        ),
                                        if (_registerMode) ...[
                                          SizedBox(height: fieldGap),
                                          _PhotoAuthTextField(
                                            controller: _passwordController,
                                            label: l10n.passwordFieldLabel,
                                            icon: Icons.lock_rounded,
                                            keyboardType:
                                                TextInputType.visiblePassword,
                                            autofillHints: const [
                                              AutofillHints.newPassword
                                            ],
                                            obscureText: !_showPassword,
                                            textInputAction:
                                                TextInputAction.next,
                                            suffixIcon: IconButton(
                                              tooltip: _showPassword
                                                  ? l10n.hidePasswordTooltip
                                                  : l10n.showPasswordTooltip,
                                              icon: Icon(_showPassword
                                                  ? Icons
                                                      .visibility_off_outlined
                                                  : Icons.visibility_outlined),
                                              onPressed: () => setState(
                                                () => _showPassword =
                                                    !_showPassword,
                                              ),
                                            ),
                                            onChanged: _clearFeedbackOnEdit,
                                            onSubmitted: null,
                                          ),
                                          SizedBox(height: fieldGap),
                                          _PhotoAuthTextField(
                                            controller:
                                                _passwordRepeatController,
                                            label: l10n.repeatPasswordLabel,
                                            icon: Icons.lock_rounded,
                                            keyboardType:
                                                TextInputType.visiblePassword,
                                            autofillHints: const [
                                              AutofillHints.newPassword
                                            ],
                                            obscureText: !_showPasswordRepeat,
                                            textInputAction:
                                                TextInputAction.done,
                                            suffixIcon: IconButton(
                                              tooltip: _showPasswordRepeat
                                                  ? l10n.hidePasswordTooltip
                                                  : l10n.showPasswordTooltip,
                                              icon: Icon(_showPasswordRepeat
                                                  ? Icons
                                                      .visibility_off_outlined
                                                  : Icons.visibility_outlined),
                                              onPressed: () => setState(
                                                () => _showPasswordRepeat =
                                                    !_showPasswordRepeat,
                                              ),
                                            ),
                                            onChanged: _clearFeedbackOnEdit,
                                            onSubmitted: _loading
                                                ? null
                                                : (_) => _submit(),
                                          ),
                                          SizedBox(height: compact ? 12 : 16),
                                          const _PhotoNewPasswordRuleCard(),
                                        ],
                                        if (_registerMode) ...[
                                          const SizedBox(height: 10),
                                          Align(
                                            alignment: Alignment.centerLeft,
                                            child: TextButton(
                                              onPressed: _loading
                                                  ? null
                                                  : () => setState(() {
                                                        _registerMode = false;
                                                        _smsStep = true;
                                                        _error = null;
                                                        _devCode = null;
                                                        _passwordController
                                                            .clear();
                                                        _passwordRepeatController
                                                            .clear();
                                                        _referralCodeController
                                                            .clear();
                                                      }),
                                              style: TextButton.styleFrom(
                                                foregroundColor: SmartTaxiColors
                                                    .textSecondary,
                                                padding: EdgeInsets.zero,
                                              ),
                                              child: Text(l10n.backToSmsCode),
                                            ),
                                          ),
                                        ],
                                      ],
                                    ),
                                  ),
                                  AnimatedSwitcher(
                                    duration: const Duration(milliseconds: 230),
                                    switchInCurve: Curves.easeOutCubic,
                                    switchOutCurve: Curves.easeInCubic,
                                    transitionBuilder:
                                        _authFeedbackTransitionBuilder,
                                    child: _errorText != null
                                        ? Padding(
                                            key:
                                                const ValueKey('welcome-error'),
                                            padding:
                                                const EdgeInsets.only(top: 10),
                                            child: _PhotoAuthErrorBanner(
                                                text: _errorText!),
                                          )
                                        : _infoText != null
                                            ? Padding(
                                                key: const ValueKey(
                                                    'welcome-info'),
                                                padding: const EdgeInsets.only(
                                                    top: 10),
                                                child: _PhotoAuthInfoLine(
                                                    text: _infoText!),
                                              )
                                            : SizedBox(
                                                key: const ValueKey(
                                                    'welcome-spacer'),
                                                height: compact ? 8 : 12),
                                  ),
                                  SizedBox(height: compact ? 3 : 7),
                                  _PhotoAuthPrimaryButton(
                                    loading: _loading,
                                    label: buttonLabel,
                                    loadingLabel: loadingLabel,
                                    onPressed: _loading ? null : _submit,
                                  ),
                                  if (showDefaultFooter) ...[
                                    SizedBox(height: compact ? 30 : 24),
                                    const _PhotoAuthSmsNotice(),
                                    SizedBox(height: compact ? 22 : 28),
                                    _PhotoAuthLegalNotice(
                                      onTerms: _openTermsDocument,
                                      onPrivacy: _openPrivacyDocument,
                                    ),
                                  ],
                                ],
                              ),
                            ),
                          ),
                        ),
                      ),
                    ),
                  ],
                );
              },
            ),
          ),
        ],
      ),
    );
  }

  void _openTermsDocument() => _showTermsLegalSheet();

  void _openPrivacyDocument() => _showPrivacyLegalSheet();

  void _showLegalSheet({
    required String title,
    required String lead,
    required List<LegalSection> sections,
  }) {
    showModalBottomSheet<void>(
      context: context,
      useSafeArea: true,
      backgroundColor: Colors.white,
      showDragHandle: true,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(30)),
      ),
      builder: (context) {
        final l10n = AppLocalizations.of(context);
        final bottomPadding = MediaQuery.paddingOf(context).bottom;
        return FractionallySizedBox(
          heightFactor: 0.78,
          child: Padding(
            padding: EdgeInsets.fromLTRB(24, 0, 24, 18 + bottomPadding),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: const TextStyle(
                    color: SmartTaxiColors.authInk,
                    fontSize: 20,
                    fontWeight: FontWeight.w900,
                    height: 1.08,
                    letterSpacing: 0,
                  ),
                ),
                const SizedBox(height: 10),
                Text(
                  lead,
                  style: const TextStyle(
                    color: SmartTaxiColors.authMuted,
                    fontSize: 13.4,
                    height: 1.42,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 14),
                Expanded(
                  child: ListView.separated(
                    physics: const BouncingScrollPhysics(),
                    itemCount: sections.length,
                    separatorBuilder: (_, __) => const SizedBox(height: 10),
                    itemBuilder: (context, index) {
                      return LegalSectionCard(section: sections[index]);
                    },
                  ),
                ),
                const SizedBox(height: 14),
                _PhotoAuthPrimaryButton(
                  loading: false,
                  label: l10n.understoodLabel,
                  loadingLabel: l10n.closingLabel,
                  onPressed: () => Navigator.of(context).pop(),
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  void _showTermsLegalSheet() {
    _showLegalSheet(
      title: AppLocalizations.of(context).termsOfUseLink,
      lead: termsOfUseLead,
      sections: termsOfUseSections,
    );
  }

  void _showPrivacyLegalSheet() {
    _showLegalSheet(
      title: AppLocalizations.of(context).privacyPolicyTitle,
      lead: privacyPolicyLead,
      sections: privacyPolicySections,
    );
  }

  Future<void> _startPasswordRecovery() async {
    if (_loading) return;
    setState(() {
      _loading = true;
      _error = null;
      _devCode = null;
    });
    try {
      final phone = _verifiedPhone ?? _normalizePhone(_phoneController.text);
      final sms = await widget.api.requestPasswordReset(phone);
      final devCode = sms['devCode'];
      setState(() {
        _verifiedPhone = (sms['phone'] ?? phone).toString();
        _phoneChecked = false;
        _smsStep = false;
        _registerMode = false;
        _resetSmsStep = true;
        _resetPasswordStep = false;
        _smsCodeController.clear();
        _passwordController.clear();
        _passwordRepeatController.clear();
        _referralCodeController.clear();
        _showPassword = false;
        _showPasswordRepeat = false;
        _devCode = devCode?.toString();
      });
      _startSmsCountdown();
    } catch (error) {
      setState(() => _error = _photoAuthError(error));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Widget _buildPasswordScreen(
    BuildContext context, {
    required Size size,
    required bool compact,
    required bool keyboardOpen,
  }) {
    final heroHeight = kAuthHeroHeight(size);
    final panelTop = (heroHeight - (compact ? 14.0 : 20.0))
        .clamp(130.0, size.height * 0.62)
        .toDouble();
    final keyboardBottom = MediaQuery.viewInsetsOf(context).bottom;
    // Room to move the panel up is limited now that it already rests near
    // the top — just tuck it in just below the status bar instead of the
    // old fixed 188/210px shift, which assumed a much taller resting
    // position and could ask for a smaller top than the panel even starts
    // at.
    final keyboardPanelTop =
        (MediaQuery.paddingOf(context).top + (compact ? 20.0 : 28.0))
            .clamp(0.0, panelTop)
            .toDouble();
    final keyboardPanelBottom = (keyboardBottom - (compact ? 112.0 : 132.0))
        .clamp(0.0, keyboardBottom)
        .toDouble();

    return Scaffold(
      resizeToAvoidBottomInset: false,
      backgroundColor: Colors.white,
      body: Stack(
        fit: StackFit.expand,
        children: [
          const _AuthBackdrop(),
          SafeArea(
            bottom: false,
            child: Align(
              alignment: Alignment.topLeft,
              child: Padding(
                padding: EdgeInsets.only(
                  left: compact ? 18 : 24,
                  top: compact ? 12 : 22,
                ),
                child: _PhotoAuthBackButton(
                  onTap: _loading ? null : _backToPhone,
                ),
              ),
            ),
          ),
          AnimatedPositioned(
            duration: const Duration(milliseconds: 260),
            curve: Curves.easeOutCubic,
            left: 0,
            right: 0,
            top: keyboardOpen ? keyboardPanelTop : panelTop,
            bottom: keyboardOpen ? keyboardPanelBottom : 0,
            child: _PhotoPasswordLoginCard(
              compact: compact,
              keyboardOpen: keyboardOpen,
              passwordController: _passwordController,
              loading: _loading,
              showPassword: _showPassword,
              error: _errorText,
              info: _infoText,
              onPasswordVisibilityChanged: () => setState(
                () => _showPassword = !_showPassword,
              ),
              onChanged: _clearFeedbackOnEdit,
              onSubmitted: _loading ? null : (_) => _submit(),
              onSubmit: _loading ? null : _submit,
              onForgotPassword: _loading ? null : _startPasswordRecovery,
              onTerms: _openTermsDocument,
              onPrivacy: _openPrivacyDocument,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildNewPasswordScreen(
    BuildContext context, {
    required Size size,
    required bool compact,
    required bool keyboardOpen,
  }) {
    final heroHeight = kAuthHeroHeight(size);
    final panelTop = (heroHeight - (compact ? 14.0 : 20.0))
        .clamp(125.0, size.height * 0.62)
        .toDouble();
    final keyboardBottom = MediaQuery.viewInsetsOf(context).bottom;
    final keyboardPanelTop =
        (MediaQuery.paddingOf(context).top + (compact ? 20.0 : 28.0))
            .clamp(0.0, panelTop)
            .toDouble();

    return Scaffold(
      resizeToAvoidBottomInset: false,
      backgroundColor: Colors.white,
      body: Stack(
        fit: StackFit.expand,
        children: [
          const _AuthBackdrop(),
          SafeArea(
            bottom: false,
            child: Align(
              alignment: Alignment.topLeft,
              child: Padding(
                padding: EdgeInsets.only(
                  left: compact ? 18 : 24,
                  top: compact ? 12 : 22,
                ),
                child: _PhotoAuthBackButton(
                  onTap: _loading ? null : _backToPhone,
                ),
              ),
            ),
          ),
          AnimatedPositioned(
            duration: const Duration(milliseconds: 260),
            curve: Curves.easeOutCubic,
            left: 0,
            right: 0,
            top: keyboardOpen ? keyboardPanelTop : panelTop,
            bottom: keyboardOpen ? keyboardBottom : 0,
            child: _PhotoNewPasswordCard(
              compact: compact,
              keyboardOpen: keyboardOpen,
              passwordController: _passwordController,
              repeatController: _passwordRepeatController,
              loading: _loading,
              showPassword: _showPassword,
              showPasswordRepeat: _showPasswordRepeat,
              error: _errorText,
              info: _infoText,
              onPasswordVisibilityChanged: () => setState(
                () => _showPassword = !_showPassword,
              ),
              onRepeatVisibilityChanged: () => setState(
                () => _showPasswordRepeat = !_showPasswordRepeat,
              ),
              onChanged: _clearFeedbackOnEdit,
              onSubmitted: _loading ? null : (_) => _submit(),
              onSubmit: _loading ? null : _submit,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSmsScreen(
    BuildContext context, {
    required Size size,
    required bool compact,
    required bool keyboardOpen,
  }) {
    final keyboardBottom = MediaQuery.viewInsetsOf(context).bottom;
    final phoneLine = _maskKazakhstanPhone(
      _verifiedPhone ?? _normalizePhone(_phoneController.text),
    );

    return Scaffold(
      resizeToAvoidBottomInset: false,
      backgroundColor: Colors.white,
      body: Stack(
        fit: StackFit.expand,
        children: [
          const _AuthBackdrop(),
          SafeArea(
            bottom: false,
            child: Align(
              alignment: Alignment.topLeft,
              child: Padding(
                padding: EdgeInsets.only(
                  left: compact ? 20 : 26,
                  top: compact ? 14 : 24,
                ),
                child: _PhotoAuthBackButton(
                  onTap: _loading ? null : _backToPhone,
                ),
              ),
            ),
          ),
          AnimatedPositioned(
            duration: const Duration(milliseconds: 300),
            curve: Curves.easeOutCubic,
            left: 0,
            right: 0,
            bottom: keyboardOpen ? keyboardBottom : 0,
            child: TweenAnimationBuilder<double>(
              tween: Tween(begin: 0, end: 1),
              duration: const Duration(milliseconds: 420),
              curve: Curves.easeOutCubic,
              builder: (context, value, child) {
                return Opacity(
                  opacity: value,
                  child: Transform.translate(
                    offset: Offset(0, (1 - value) * 28),
                    child: child,
                  ),
                );
              },
              child: _PhotoSmsVerificationCard(
                compact: compact,
                keyboardOpen: keyboardOpen,
                phone: phoneLine,
                controller: _smsCodeController,
                loading: _loading,
                error: _errorText,
                info: _infoText,
                resendRemaining: _smsResendRemaining,
                countdownLabel: _smsCountdownLabel(),
                onChanged: (value) {
                  _clearFeedbackOnEdit(value);
                },
                onSubmitted: _loading ? null : (_) => _submit(),
                onContinue: _loading ? null : _submit,
                onResend:
                    _smsResendRemaining == 0 && !_loading ? _resendSms : null,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _PhotoPasswordLoginCard extends StatelessWidget {
  const _PhotoPasswordLoginCard({
    required this.compact,
    required this.keyboardOpen,
    required this.passwordController,
    required this.loading,
    required this.showPassword,
    required this.error,
    required this.info,
    required this.onPasswordVisibilityChanged,
    required this.onChanged,
    required this.onSubmitted,
    required this.onSubmit,
    required this.onForgotPassword,
    required this.onTerms,
    required this.onPrivacy,
  });

  final bool compact;
  final bool keyboardOpen;
  final TextEditingController passwordController;
  final bool loading;
  final bool showPassword;
  final String? error;
  final String? info;
  final VoidCallback onPasswordVisibilityChanged;
  final ValueChanged<String> onChanged;
  final ValueChanged<String>? onSubmitted;
  final VoidCallback? onSubmit;
  final VoidCallback? onForgotPassword;
  final VoidCallback onTerms;
  final VoidCallback onPrivacy;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final bottomPadding = MediaQuery.paddingOf(context).bottom;
    final horizontalPadding = compact ? 30.0 : 38.0;
    final topPadding =
        keyboardOpen ? (compact ? 24.0 : 30.0) : (compact ? 34.0 : 42.0);
    final fieldGap =
        keyboardOpen ? (compact ? 14.0 : 16.0) : (compact ? 18.0 : 22.0);
    final titleSize =
        keyboardOpen ? (compact ? 24.0 : 27.0) : (compact ? 26.0 : 30.0);
    final subtitleSize =
        keyboardOpen ? (compact ? 12.6 : 13.6) : (compact ? 13.0 : 15.0);

    return GestureDetector(
      behavior: HitTestBehavior.translucent,
      onTap: () => FocusScope.of(context).unfocus(),
      child: Container(
        width: double.infinity,
        padding: EdgeInsets.fromLTRB(
          horizontalPadding,
          topPadding,
          horizontalPadding,
          (keyboardOpen ? 14.0 : 18.0) + bottomPadding,
        ),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius:
              BorderRadius.vertical(top: Radius.circular(compact ? 34 : 42)),
          boxShadow: SmartTaxiShadows.sheet,
        ),
        child: SingleChildScrollView(
          physics: keyboardOpen
              ? const BouncingScrollPhysics()
              : const NeverScrollableScrollPhysics(),
          padding: EdgeInsets.zero,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                l10n.validateEnterPassword,
                style: TextStyle(
                  color: SmartTaxiColors.authInk,
                  fontSize: titleSize,
                  height: 1.05,
                  fontWeight: FontWeight.w900,
                  letterSpacing: -0.3,
                ),
              ),
              SizedBox(height: keyboardOpen ? 8 : (compact ? 10 : 13)),
              Text(
                keyboardOpen
                    ? l10n.passwordLoginSubtitle
                    : l10n.passwordLoginWelcome,
                style: TextStyle(
                  color: SmartTaxiColors.authMuted,
                  fontSize: subtitleSize,
                  height: compact ? 1.34 : 1.42,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 0,
                ),
              ),
              SizedBox(height: fieldGap),
              _PhotoAuthTextField(
                controller: passwordController,
                label: l10n.validateEnterPassword,
                prefix: _PhotoPasswordLockIcon(compact: compact),
                keyboardType: TextInputType.visiblePassword,
                autofillHints: const [AutofillHints.password],
                obscureText: !showPassword,
                textInputAction: TextInputAction.done,
                suffixIcon: IconButton(
                  tooltip: showPassword
                      ? l10n.hidePasswordTooltip
                      : l10n.showPasswordTooltip,
                  icon: Icon(
                    showPassword
                        ? Icons.visibility_off_outlined
                        : Icons.visibility_outlined,
                    size: 24,
                  ),
                  onPressed: onPasswordVisibilityChanged,
                ),
                onChanged: onChanged,
                onSubmitted: onSubmitted,
              ),
              SizedBox(height: compact ? 8 : 11),
              Align(
                alignment: Alignment.centerRight,
                child: TextButton(
                  onPressed: onForgotPassword,
                  style: TextButton.styleFrom(
                    foregroundColor: SmartTaxiColors.authInk,
                    padding:
                        const EdgeInsets.symmetric(horizontal: 0, vertical: 5),
                    tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                    minimumSize: const Size(0, 0),
                  ),
                  child: Text(
                    l10n.forgotPasswordLabel,
                    style: TextStyle(
                      fontSize: compact ? 13.2 : 14.6,
                      height: 1.1,
                      fontWeight: FontWeight.w700,
                      decoration: TextDecoration.underline,
                      decorationColor: const Color(0x66111426),
                      decorationThickness: 0.75,
                      letterSpacing: 0,
                    ),
                  ),
                ),
              ),
              AnimatedSwitcher(
                duration: const Duration(milliseconds: 230),
                switchInCurve: Curves.easeOutCubic,
                switchOutCurve: Curves.easeInCubic,
                transitionBuilder: _authFeedbackTransitionBuilder,
                child: error != null
                    ? Padding(
                        key: const ValueKey('password-error'),
                        padding: const EdgeInsets.only(top: 9),
                        child: _PhotoAuthErrorBanner(text: error!),
                      )
                    : info != null
                        ? Padding(
                            key: const ValueKey('password-info'),
                            padding: const EdgeInsets.only(top: 9),
                            child: _PhotoAuthInfoLine(text: info!),
                          )
                        : SizedBox(
                            key: const ValueKey('password-spacer'),
                            height: compact ? 5 : 8,
                          ),
              ),
              SizedBox(height: compact ? 10 : 14),
              _PhotoAuthPrimaryButton(
                loading: loading,
                label: l10n.logIn,
                loadingLabel: l10n.loggingInLabel,
                onPressed: onSubmit,
              ),
              if (!keyboardOpen) ...[
                SizedBox(height: compact ? 24 : 30),
                _PhotoAuthLegalNotice(onTerms: onTerms, onPrivacy: onPrivacy),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _PhotoNewPasswordCard extends StatelessWidget {
  const _PhotoNewPasswordCard({
    required this.compact,
    required this.keyboardOpen,
    required this.passwordController,
    required this.repeatController,
    required this.loading,
    required this.showPassword,
    required this.showPasswordRepeat,
    required this.error,
    required this.info,
    required this.onPasswordVisibilityChanged,
    required this.onRepeatVisibilityChanged,
    required this.onChanged,
    required this.onSubmitted,
    required this.onSubmit,
  });

  final bool compact;
  final bool keyboardOpen;
  final TextEditingController passwordController;
  final TextEditingController repeatController;
  final bool loading;
  final bool showPassword;
  final bool showPasswordRepeat;
  final String? error;
  final String? info;
  final VoidCallback onPasswordVisibilityChanged;
  final VoidCallback onRepeatVisibilityChanged;
  final ValueChanged<String> onChanged;
  final ValueChanged<String>? onSubmitted;
  final VoidCallback? onSubmit;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final bottomPadding = MediaQuery.paddingOf(context).bottom;
    final horizontalPadding = compact ? 30.0 : 38.0;
    final topPadding =
        keyboardOpen ? (compact ? 24.0 : 28.0) : (compact ? 34.0 : 42.0);
    final fieldGap = keyboardOpen ? 14.0 : (compact ? 17.0 : 21.0);

    final formChildren = <Widget>[
      Text(
        l10n.newPasswordFieldLabel,
        style: TextStyle(
          color: SmartTaxiColors.authInk,
          fontSize:
              keyboardOpen ? (compact ? 23.0 : 26.0) : (compact ? 25.0 : 29.0),
          height: 1.08,
          fontWeight: FontWeight.w900,
          letterSpacing: 0,
        ),
      ),
      SizedBox(height: keyboardOpen ? 8 : 12),
      Text(
        l10n.newPasswordSubtitle,
        style: TextStyle(
          color: SmartTaxiColors.authMuted,
          fontSize:
              keyboardOpen ? (compact ? 12.6 : 13.6) : (compact ? 13.0 : 15.0),
          height: 1.36,
          fontWeight: FontWeight.w700,
          letterSpacing: 0,
        ),
      ),
      SizedBox(height: keyboardOpen ? 18 : (compact ? 27 : 34)),
      _PhotoPasswordFieldGroup(
        label: l10n.newPasswordFieldLabel,
        controller: passwordController,
        hintText: l10n.validateEnterNewPassword,
        showPassword: showPassword,
        onVisibilityChanged: onPasswordVisibilityChanged,
        textInputAction: TextInputAction.next,
        onChanged: onChanged,
      ),
      SizedBox(height: fieldGap),
      _PhotoPasswordFieldGroup(
        label: l10n.repeatPasswordLabel,
        controller: repeatController,
        hintText: l10n.repeatPasswordHint,
        showPassword: showPasswordRepeat,
        onVisibilityChanged: onRepeatVisibilityChanged,
        textInputAction: TextInputAction.done,
        onChanged: onChanged,
        onSubmitted: onSubmitted,
      ),
      SizedBox(height: keyboardOpen ? 14 : (compact ? 18 : 24)),
      const _PhotoNewPasswordRuleCard(),
      AnimatedSwitcher(
        duration: const Duration(milliseconds: 230),
        switchInCurve: Curves.easeOutCubic,
        switchOutCurve: Curves.easeInCubic,
        transitionBuilder: _authFeedbackTransitionBuilder,
        child: error != null
            ? Padding(
                key: const ValueKey('new-password-error'),
                padding: const EdgeInsets.only(top: 12),
                child: _PhotoAuthErrorBanner(text: error!),
              )
            : info != null
                ? Padding(
                    key: const ValueKey('new-password-info'),
                    padding: const EdgeInsets.only(top: 12),
                    child: _PhotoAuthInfoLine(text: info!),
                  )
                : SizedBox(
                    key: const ValueKey('new-password-spacer'),
                    height: keyboardOpen ? 8 : 14,
                  ),
      ),
      SizedBox(height: keyboardOpen ? 10 : 14),
      _PhotoAuthPrimaryButton(
        loading: loading,
        label: l10n.savePasswordButton,
        loadingLabel: l10n.savingLabel,
        onPressed: onSubmit,
      ),
      if (!keyboardOpen) ...[
        SizedBox(height: compact ? 24 : 32),
        const _PhotoNewPasswordSafeNote(),
      ],
    ];

    final child = keyboardOpen
        ? SingleChildScrollView(
            physics: const BouncingScrollPhysics(),
            keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: formChildren,
            ),
          )
        : Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              ...formChildren,
              const Spacer(),
            ],
          );

    return GestureDetector(
      behavior: HitTestBehavior.translucent,
      onTap: () => FocusScope.of(context).unfocus(),
      child: Container(
        width: double.infinity,
        padding: EdgeInsets.fromLTRB(
          horizontalPadding,
          topPadding,
          horizontalPadding,
          (keyboardOpen ? 14.0 : 18.0) + bottomPadding,
        ),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius:
              BorderRadius.vertical(top: Radius.circular(compact ? 34 : 42)),
          boxShadow: SmartTaxiShadows.sheet,
        ),
        child: child,
      ),
    );
  }
}

class _PhotoPasswordFieldGroup extends StatelessWidget {
  const _PhotoPasswordFieldGroup({
    required this.label,
    required this.controller,
    required this.hintText,
    required this.showPassword,
    required this.onVisibilityChanged,
    required this.textInputAction,
    required this.onChanged,
    this.onSubmitted,
  });

  final String label;
  final TextEditingController controller;
  final String hintText;
  final bool showPassword;
  final VoidCallback onVisibilityChanged;
  final TextInputAction textInputAction;
  final ValueChanged<String> onChanged;
  final ValueChanged<String>? onSubmitted;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final compact = _isCompactAuthViewport(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: TextStyle(
            color: SmartTaxiColors.authInk,
            fontSize: compact ? 13.0 : 14.2,
            height: 1.15,
            fontWeight: FontWeight.w800,
            letterSpacing: 0,
          ),
        ),
        const SizedBox(height: 9),
        _PhotoAuthTextField(
          controller: controller,
          label: hintText,
          obscureText: !showPassword,
          keyboardType: TextInputType.visiblePassword,
          autofillHints: const [AutofillHints.newPassword],
          textInputAction: textInputAction,
          suffixIcon: IconButton(
            tooltip: showPassword
                ? l10n.hidePasswordTooltip
                : l10n.showPasswordTooltip,
            icon: Icon(
              showPassword
                  ? Icons.visibility_off_outlined
                  : Icons.visibility_outlined,
              size: 24,
            ),
            onPressed: onVisibilityChanged,
          ),
          onChanged: onChanged,
          onSubmitted: onSubmitted,
        ),
      ],
    );
  }
}

class _PhotoNewPasswordRuleCard extends StatelessWidget {
  const _PhotoNewPasswordRuleCard();

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final compact = _isCompactAuthViewport(context);
    return Container(
      padding: EdgeInsets.fromLTRB(
        compact ? 16 : 20,
        compact ? 14 : 17,
        compact ? 16 : 20,
        compact ? 14 : 17,
      ),
      decoration: BoxDecoration(
        color: const Color(0xfffbfcff),
        borderRadius: BorderRadius.circular(20),
        boxShadow: const [
          BoxShadow(
            color: Color(0x09102a52),
            blurRadius: 22,
            offset: Offset(0, 10),
          ),
        ],
      ),
      child: Row(
        children: [
          Container(
            width: compact ? 42 : 48,
            height: compact ? 42 : 48,
            decoration: const BoxDecoration(
              color: SmartTaxiColors.brand,
              shape: BoxShape.circle,
            ),
            child: Icon(
              Icons.check_rounded,
              color: Colors.white,
              size: compact ? 25 : 29,
            ),
          ),
          SizedBox(width: compact ? 13 : 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  l10n.strongPasswordTitle,
                  style: TextStyle(
                    color: SmartTaxiColors.authInk,
                    fontSize: compact ? 13.8 : 15.4,
                    height: 1.12,
                    fontWeight: FontWeight.w900,
                    letterSpacing: 0,
                  ),
                ),
                const SizedBox(height: 5),
                Text(
                  l10n.strongPasswordHint,
                  style: TextStyle(
                    color: SmartTaxiColors.authMuted,
                    fontSize: compact ? 12.2 : 13.6,
                    height: 1.33,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 0,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _PhotoNewPasswordSafeNote extends StatelessWidget {
  const _PhotoNewPasswordSafeNote();

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final compact = _isCompactAuthViewport(context);
    return Row(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        Container(
          width: compact ? 40 : 46,
          height: compact ? 40 : 46,
          decoration: const BoxDecoration(
            color: SmartTaxiColors.brandPale,
            shape: BoxShape.circle,
          ),
          child: Icon(
            Icons.lock_outline_rounded,
            color: SmartTaxiColors.brandDeep,
            size: compact ? 21 : 24,
          ),
        ),
        SizedBox(width: compact ? 13 : 16),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                l10n.secureTitle,
                style: TextStyle(
                  color: SmartTaxiColors.authInk,
                  fontSize: compact ? 13.1 : 14.6,
                  height: 1.2,
                  fontWeight: FontWeight.w900,
                  letterSpacing: 0,
                ),
              ),
              const SizedBox(height: 5),
              Text(
                l10n.secureHint,
                style: TextStyle(
                  color: SmartTaxiColors.authMuted,
                  fontSize: compact ? 11.8 : 13.2,
                  height: 1.32,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 0,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _PhotoPhoneField extends StatefulWidget {
  const _PhotoPhoneField({
    super.key,
    required this.controller,
    this.onChanged,
    this.onSubmitted,
  });

  final TextEditingController controller;
  final ValueChanged<String>? onChanged;
  final ValueChanged<String>? onSubmitted;

  @override
  State<_PhotoPhoneField> createState() => _PhotoPhoneFieldState();
}

class _PhotoPasswordLockIcon extends StatelessWidget {
  const _PhotoPasswordLockIcon({required this.compact});

  final bool compact;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(
        left: compact ? 15 : 17,
        right: compact ? 11 : 13,
      ),
      child: SizedBox(
        width: compact ? 25 : 27,
        height: compact ? 25 : 27,
        child: const CustomPaint(painter: _PhotoPasswordLockPainter()),
      ),
    );
  }
}

class _PhotoPasswordLockPainter extends CustomPainter {
  const _PhotoPasswordLockPainter();

  @override
  void paint(Canvas canvas, Size size) {
    final scale = size.width / 27;
    final stroke = 2.35 * scale;
    final paint = Paint()
      ..color = SmartTaxiColors.authIcon
      ..style = PaintingStyle.stroke
      ..strokeWidth = stroke
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round;

    final body = RRect.fromRectAndRadius(
      Rect.fromLTWH(5.0 * scale, 11.2 * scale, 17.0 * scale, 11.6 * scale),
      Radius.circular(3.0 * scale),
    );
    canvas.drawRRect(body, paint);

    final shackle = Path()
      ..moveTo(8.1 * scale, 11.1 * scale)
      ..lineTo(8.1 * scale, 8.6 * scale)
      ..cubicTo(
        8.1 * scale,
        4.6 * scale,
        10.8 * scale,
        2.6 * scale,
        13.5 * scale,
        2.6 * scale,
      )
      ..cubicTo(
        16.2 * scale,
        2.6 * scale,
        18.9 * scale,
        4.6 * scale,
        18.9 * scale,
        8.6 * scale,
      )
      ..lineTo(18.9 * scale, 11.1 * scale);
    canvas.drawPath(shackle, paint);

    final dotPaint = Paint()
      ..color = SmartTaxiColors.authIcon
      ..style = PaintingStyle.fill;
    canvas.drawCircle(
        Offset(13.5 * scale, 16.9 * scale), 1.35 * scale, dotPaint);
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

class _PhotoPhoneFieldState extends State<_PhotoPhoneField> {
  final _focusNode = FocusNode();

  @override
  void initState() {
    super.initState();
    _focusNode.addListener(_handleFocusChanged);
  }

  @override
  void dispose() {
    _focusNode
      ..removeListener(_handleFocusChanged)
      ..dispose();
    super.dispose();
  }

  void _handleFocusChanged() {
    if (mounted) setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    return _PhotoAuthTextField(
      controller: widget.controller,
      label: AppLocalizations.of(context).phoneNumberLabel,
      hintText: _focusNode.hasFocus ? '777 777 77 77' : null,
      focusNode: _focusNode,
      keyboardType: TextInputType.phone,
      // No AutofillHints here: with AutofillHints.telephoneNumber, Android's
      // OS-level autofill service (most aggressively on MIUI) can silently
      // repopulate this field with a different cached number when it
      // remounts on refocus (e.g. navigating back from the OTP step) even
      // though _phoneController's own value never changes in our code. The
      // formatter/helpers below are pure, order-preserving functions of the
      // current text, so they cannot themselves reorder or substitute
      // digits; dropping the hint removes the one platform-level path that
      // can overwrite the field without the user typing anything.
      inputFormatters: const [_KazakhstanPhoneInputFormatter()],
      textInputAction: TextInputAction.done,
      onChanged: widget.onChanged,
      onSubmitted: widget.onSubmitted,
      prefix: Padding(
        padding: const EdgeInsets.only(left: 17, right: 11),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text(
              '+7',
              style: TextStyle(
                color: SmartTaxiColors.authInk,
                fontSize: 16.2,
                fontWeight: FontWeight.w800,
              ),
            ),
            const SizedBox(width: 12),
            Container(width: 1, height: 27, color: SmartTaxiColors.authBorder),
          ],
        ),
      ),
    );
  }
}

class _PhotoAuthTextField extends StatelessWidget {
  const _PhotoAuthTextField({
    required this.controller,
    required this.label,
    this.icon,
    this.prefix,
    this.suffixIcon,
    this.hintText,
    this.focusNode,
    this.autofillHints,
    this.keyboardType,
    this.inputFormatters,
    this.textCapitalization = TextCapitalization.none,
    this.textInputAction = TextInputAction.next,
    this.obscureText = false,
    this.onChanged,
    this.onSubmitted,
  });

  final TextEditingController controller;
  final String label;
  final IconData? icon;
  final Widget? prefix;
  final Widget? suffixIcon;
  final String? hintText;
  final FocusNode? focusNode;
  final Iterable<String>? autofillHints;
  final TextInputType? keyboardType;
  final List<TextInputFormatter>? inputFormatters;
  final TextCapitalization textCapitalization;
  final TextInputAction textInputAction;
  final bool obscureText;
  final ValueChanged<String>? onChanged;
  final ValueChanged<String>? onSubmitted;

  @override
  Widget build(BuildContext context) {
    return TextField(
      controller: controller,
      focusNode: focusNode,
      cursorColor: SmartTaxiColors.brand,
      style: const TextStyle(
        color: SmartTaxiColors.authInk,
        fontSize: 15.4,
        height: 1.1,
        fontWeight: FontWeight.w800,
      ),
      decoration: InputDecoration(
        labelText: label,
        hintText: hintText,
        floatingLabelBehavior: FloatingLabelBehavior.never,
        labelStyle: const TextStyle(
          color: SmartTaxiColors.authFieldLabel,
          fontSize: 15.4,
          fontWeight: FontWeight.w700,
        ),
        hintStyle: const TextStyle(
          color: SmartTaxiColors.authFieldHint,
          fontSize: 15.4,
          fontWeight: FontWeight.w600,
        ),
        // A fixed-width reserved box (not minWidth:0) so every field's icon
        // sits at the exact same x position and is centered the same way
        // regardless of that particular glyph's intrinsic bounding box —
        // otherwise badge_rounded vs lock_rounded visibly don't line up
        // with each other or with the label text next to them.
        prefixIcon: prefix ?? (icon == null ? null : Icon(icon, size: 20)),
        prefixIconColor: SmartTaxiColors.authIcon,
        suffixIcon: suffixIcon,
        suffixIconColor: SmartTaxiColors.authIcon,
        prefixIconConstraints:
            const BoxConstraints(minWidth: 46, minHeight: 20),
        filled: true,
        fillColor: Colors.white,
        contentPadding:
            const EdgeInsets.symmetric(horizontal: 17, vertical: 14),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(20),
          borderSide:
              const BorderSide(color: SmartTaxiColors.authBorder, width: 1.15),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(20),
          borderSide: const BorderSide(color: SmartTaxiColors.brand, width: 1.5),
        ),
      ),
      autofillHints: autofillHints,
      keyboardType: keyboardType,
      inputFormatters: inputFormatters,
      textCapitalization: textCapitalization,
      textInputAction: textInputAction,
      obscureText: obscureText,
      onChanged: onChanged,
      onSubmitted: onSubmitted,
    );
  }
}

class _KazakhstanPhoneInputFormatter extends TextInputFormatter {
  const _KazakhstanPhoneInputFormatter();

  @override
  TextEditingValue formatEditUpdate(
    TextEditingValue oldValue,
    TextEditingValue newValue,
  ) {
    var digits = _phoneDigits(newValue.text);
    if (digits.length > 10 &&
        (digits.startsWith('7') || digits.startsWith('8'))) {
      digits = digits.substring(1);
    }
    if (digits.length > 10) digits = digits.substring(0, 10);

    final formatted = StringBuffer();
    for (var i = 0; i < digits.length; i += 1) {
      if (i == 3 || i == 6 || i == 8) formatted.write(' ');
      formatted.write(digits[i]);
    }

    final text = formatted.toString();
    return TextEditingValue(
      text: text,
      selection: TextSelection.collapsed(offset: text.length),
    );
  }
}

class _PhotoAuthErrorBanner extends StatelessWidget {
  const _PhotoAuthErrorBanner({required this.text});

  final String text;

  @override
  Widget build(BuildContext context) {
    // A left accent bar + solid-fill icon chip instead of an all-over
    // border: reads as a deliberate, designed alert (Stripe/Linear-style)
    // rather than a boxed-in warning. The bar is a plain colored Container
    // clipped by the outer rounded shape, not a Border side — a non-uniform
    // Border (one side only) paired with borderRadius throws a Flutter
    // assertion at paint time ("A borderRadius can only be given for a
    // uniform Border"), which is what the earlier broken banner hit.
    return Semantics(
      liveRegion: true,
      child: Container(
        clipBehavior: Clip.antiAlias,
        decoration: BoxDecoration(
          color: const Color(0xFFFFF5F5),
          borderRadius: BorderRadius.circular(14),
          boxShadow: [
            BoxShadow(
              color: SmartTaxiColors.danger.withValues(alpha: 0.10),
              blurRadius: 16,
              offset: const Offset(0, 6),
            ),
          ],
        ),
        child: IntrinsicHeight(
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const SizedBox(
                  width: 3, child: ColoredBox(color: SmartTaxiColors.danger)),
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(11, 11, 14, 11),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.center,
                    children: [
                      Container(
                        width: 24,
                        height: 24,
                        decoration: const BoxDecoration(
                          color: SmartTaxiColors.danger,
                          shape: BoxShape.circle,
                        ),
                        child: const Icon(
                          Icons.priority_high_rounded,
                          size: 15,
                          color: Colors.white,
                        ),
                      ),
                      const SizedBox(width: 11),
                      Expanded(
                        child: Text(
                          text,
                          style: const TextStyle(
                            color: Color(0xFF1F2933),
                            fontSize: 12.8,
                            height: 1.3,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _PhotoAuthInfoLine extends StatelessWidget {
  const _PhotoAuthInfoLine({required this.text});

  final String text;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      liveRegion: true,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        decoration: BoxDecoration(
          color: SmartTaxiColors.brandPale,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: SmartTaxiColors.brandSoft, width: 1),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.center,
          children: [
            Container(
              width: 26,
              height: 26,
              decoration: const BoxDecoration(
                color: Colors.white,
                shape: BoxShape.circle,
              ),
              child: const Icon(
                Icons.check_circle_outline_rounded,
                size: 17,
                color: SmartTaxiColors.brand,
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                text,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  color: SmartTaxiColors.brandDeep,
                  fontSize: 12.6,
                  height: 1.25,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _PhotoAuthSmsNotice extends StatelessWidget {
  const _PhotoAuthSmsNotice();

  @override
  Widget build(BuildContext context) {
    final compact = _isCompactAuthViewport(context);
    return Center(
      child: ConstrainedBox(
        constraints: BoxConstraints(maxWidth: compact ? 284 : 342),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          crossAxisAlignment: CrossAxisAlignment.center,
          children: [
            Container(
              width: compact ? 32 : 38,
              height: compact ? 32 : 38,
              decoration: const BoxDecoration(
                color: SmartTaxiColors.brandPale,
                shape: BoxShape.circle,
                boxShadow: [
                  BoxShadow(
                    color: Color(0x0f000000),
                    blurRadius: 16,
                    offset: Offset(0, 8),
                  ),
                ],
              ),
              child: Icon(
                Icons.shield_outlined,
                color: SmartTaxiColors.brandDeep,
                size: compact ? 18 : 21,
              ),
            ),
            SizedBox(width: compact ? 10 : 13),
            Expanded(
              child: Text(
                AppLocalizations.of(context).authSmsConsentNotice,
                textAlign: TextAlign.left,
                style: TextStyle(
                  color: SmartTaxiColors.authMuted,
                  fontSize: compact ? 11.2 : 12.8,
                  height: compact ? 1.3 : 1.4,
                  fontWeight: FontWeight.w500,
                  letterSpacing: 0,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _PhotoAuthLegalNotice extends StatelessWidget {
  const _PhotoAuthLegalNotice({
    required this.onTerms,
    required this.onPrivacy,
  });

  final VoidCallback onTerms;
  final VoidCallback onPrivacy;

  @override
  Widget build(BuildContext context) {
    final compact = _isCompactAuthViewport(context);
    final l10n = AppLocalizations.of(context);
    return Column(
      children: [
        Row(
          children: [
            const Expanded(child: _PhotoAuthLegalDivider()),
            Padding(
              padding: EdgeInsets.symmetric(horizontal: compact ? 8 : 13),
              child: Text(
                l10n.authLegalConsentPrefix,
                style: TextStyle(
                  color: SmartTaxiColors.authCaption,
                  fontSize: compact ? 10.2 : 11.7,
                  height: 1.2,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ),
            const Expanded(child: _PhotoAuthLegalDivider()),
          ],
        ),
        SizedBox(height: compact ? 7 : 9),
        FittedBox(
          fit: BoxFit.scaleDown,
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              _PhotoAuthLegalLink(
                text: l10n.termsOfUseLink,
                onTap: onTerms,
              ),
              Text(
                ' ${l10n.authLegalConsentJoiner} ',
                style: const TextStyle(
                  color: SmartTaxiColors.authInk,
                  fontSize: 10.8,
                  height: 1.35,
                  fontWeight: FontWeight.w600,
                ),
              ),
              _PhotoAuthLegalLink(
                text: l10n.privacyPolicyLink,
                onTap: onPrivacy,
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _PhotoAuthLegalDivider extends StatelessWidget {
  const _PhotoAuthLegalDivider();

  @override
  Widget build(BuildContext context) {
    return Container(height: 1, color: SmartTaxiColors.authBorder);
  }
}

class _PhotoAuthLegalLink extends StatelessWidget {
  const _PhotoAuthLegalLink({
    required this.text,
    required this.onTap,
  });

  final String text;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 2),
        child: Text(
          text,
          textAlign: TextAlign.center,
          style: const TextStyle(
            color: SmartTaxiColors.authInk,
            fontSize: 10.8,
            height: 1.35,
            fontWeight: FontWeight.w700,
            decoration: TextDecoration.underline,
            decorationColor: Color(0x55111426),
            decorationThickness: 0.75,
          ),
        ),
      ),
    );
  }
}

class _PhotoAuthPrimaryButton extends StatelessWidget {
  const _PhotoAuthPrimaryButton({
    required this.loading,
    required this.label,
    required this.loadingLabel,
    required this.onPressed,
  });

  final bool loading;
  final String label;
  final String loadingLabel;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    final enabled = onPressed != null && !loading;
    final radius = BorderRadius.circular(16);
    return DecoratedBox(
      decoration: BoxDecoration(
        borderRadius: radius,
        gradient: LinearGradient(
          begin: Alignment.centerLeft,
          end: Alignment.centerRight,
          colors: enabled
              ? const [
                  SmartTaxiColors.authGradientStart,
                  SmartTaxiColors.brandDeep,
                ]
              : [
                  SmartTaxiColors.brandSoft.withValues(alpha: 0.6),
                  SmartTaxiColors.brandSoft.withValues(alpha: 0.6),
                ],
        ),
        boxShadow: enabled
            ? [
                BoxShadow(
                  color: SmartTaxiColors.brand.withValues(alpha: 0.32),
                  blurRadius: 22,
                  spreadRadius: -4,
                  offset: const Offset(0, 11),
                ),
              ]
            : null,
      ),
      child: SizedBox(
        height: 52,
        child: Material(
          color: Colors.transparent,
          borderRadius: radius,
          clipBehavior: Clip.antiAlias,
          child: InkWell(
            onTap: enabled ? onPressed : null,
            borderRadius: radius,
            splashColor: Colors.white24,
            highlightColor: Colors.white10,
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 28),
              child: loading
                  ? Center(child: _ButtonLoader(text: loadingLabel))
                  : Stack(
                      alignment: Alignment.center,
                      children: [
                        Center(
                          child: Padding(
                            padding: const EdgeInsets.symmetric(horizontal: 38),
                            child: Text(
                              label,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                color: Colors.white,
                                fontSize: 16,
                                height: 1,
                                fontWeight: FontWeight.w900,
                              ),
                            ),
                          ),
                        ),
                        const Positioned(
                          right: 0,
                          child: Icon(
                            Icons.arrow_forward_rounded,
                            color: Colors.white,
                            size: 25,
                          ),
                        ),
                      ],
                    ),
            ),
          ),
        ),
      ),
    );
  }
}

class _PremiumCard extends StatelessWidget {
  const _PremiumCard({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border.all(color: SmartTaxiColors.border),
        borderRadius: BorderRadius.circular(28),
        boxShadow: const [
          BoxShadow(
              color: Color(0x1a1d6fff), blurRadius: 38, offset: Offset(0, 18))
        ],
      ),
      child: child,
    );
  }
}

String _userLabel(dynamic user) {
  if (user is! Map) return 'Аккаунт SmartTaxi';
  return (user['login'] ?? user['name'] ?? user['phone'] ?? 'Аккаунт SmartTaxi')
      .toString();
}

String _userId(dynamic user) {
  if (user is! Map) return '';
  return (user['id'] ?? '').toString();
}

String _userPhone(dynamic user) {
  if (user is! Map) return '';
  return (user['phone'] ?? '').toString();
}

String _userMail(dynamic user) {
  if (user is! Map) return '';
  return (user['email'] ?? '').toString();
}

String _userRole(dynamic user) {
  if (user is! Map) return '';
  return (user['role'] ?? '').toString();
}

String _phoneDigits(String value) => value.replaceAll(RegExp(r'\D'), '');

String _normalizePhone(String value) {
  final raw = value.trim();
  final digits = _phoneDigits(raw);
  if (digits.isEmpty) return raw;
  if (digits.length == 10) return '+7$digits';
  if (digits.length == 11 && digits.startsWith('8')) {
    return '+7${digits.substring(1)}';
  }
  if (digits.startsWith('7')) return '+$digits';
  if (raw.startsWith('+')) return '+$digits';
  return raw;
}

String _formatKazakhstanPhone(String value) {
  var digits = _phoneDigits(value);
  if (digits.length > 10 &&
      (digits.startsWith('7') || digits.startsWith('8'))) {
    digits = digits.substring(1);
  }
  if (digits.length > 10) digits = digits.substring(0, 10);
  if (digits.isEmpty) return '+7';

  final formatted = StringBuffer('+7');
  for (var i = 0; i < digits.length; i += 1) {
    if (i == 0 || i == 3 || i == 6 || i == 8) {
      formatted.write(' ');
    }
    formatted.write(digits[i]);
  }
  return formatted.toString();
}

String _maskKazakhstanPhone(String value) {
  var digits = _phoneDigits(value);
  if (digits.length > 10 &&
      (digits.startsWith('7') || digits.startsWith('8'))) {
    digits = digits.substring(1);
  }
  if (digits.length > 10) digits = digits.substring(0, 10);
  if (digits.length < 10) return _formatKazakhstanPhone(value);
  return '+7 ${digits.substring(0, 3)} *** ${digits.substring(6, 8)} ${digits.substring(8, 10)}';
}
