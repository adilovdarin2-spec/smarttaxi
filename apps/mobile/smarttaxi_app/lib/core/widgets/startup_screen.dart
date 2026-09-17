import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../l10n/app_localizations.dart';
import 'brand_logo.dart';

/// Branded first Flutter frame shown while session restoration is in flight.
/// The native Android window uses the same blue so cold start is seamless.
class StartupScreen extends StatelessWidget {
  const StartupScreen({super.key});

  static const _deepBlue = Color(0xff0b4fd1);
  static const _brandBlue = Color(0xff1d6fff);
  static const _skyBlue = Color(0xff438cff);

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: const SystemUiOverlayStyle(
        statusBarColor: Colors.transparent,
        statusBarIconBrightness: Brightness.light,
        statusBarBrightness: Brightness.dark,
        systemNavigationBarColor: _deepBlue,
        systemNavigationBarIconBrightness: Brightness.light,
      ),
      child: Scaffold(
        backgroundColor: _brandBlue,
        body: DecoratedBox(
          decoration: const BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [_deepBlue, _brandBlue, _skyBlue],
              stops: [0, .58, 1],
            ),
          ),
          child: Stack(
            fit: StackFit.expand,
            children: [
              const Positioned(
                top: -112,
                right: -92,
                child: _StartupOrb(size: 296, opacity: .08),
              ),
              const Positioned(
                top: 118,
                left: -82,
                child: _StartupOrb(size: 188, opacity: .055),
              ),
              const Positioned(
                bottom: -134,
                right: -72,
                child: _StartupOrb(size: 280, opacity: .07),
              ),
              SafeArea(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(28, 20, 28, 24),
                  child: Column(
                    children: [
                      const Spacer(flex: 4),
                      Semantics(
                        label: 'BaiSapar',
                        image: true,
                        child: Container(
                          key: const ValueKey('startup-brand-icon'),
                          width: 148,
                          height: 148,
                          padding: const EdgeInsets.all(13),
                          decoration: BoxDecoration(
                            color: Colors.white.withValues(alpha: .12),
                            borderRadius: BorderRadius.circular(42),
                            border: Border.all(
                              color: Colors.white.withValues(alpha: .24),
                            ),
                            boxShadow: const [
                              BoxShadow(
                                color: Color(0x38002f91),
                                blurRadius: 42,
                                offset: Offset(0, 20),
                              ),
                            ],
                          ),
                          child: ClipRRect(
                            borderRadius: BorderRadius.circular(32),
                            child: const Image(
                              image: AssetImage(BrandLogo.iconAssetPath),
                              fit: BoxFit.cover,
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(height: 28),
                      const Image(
                        key: ValueKey('startup-wordmark'),
                        image: AssetImage(BrandLogo.wordmarkLightAssetPath),
                        width: 224,
                        height: 46,
                        fit: BoxFit.contain,
                      ),
                      const SizedBox(height: 14),
                      ConstrainedBox(
                        constraints: const BoxConstraints(maxWidth: 300),
                        child: Text(
                          l10n.appTagline,
                          textAlign: TextAlign.center,
                          maxLines: 2,
                          overflow: TextOverflow.fade,
                          style: TextStyle(
                            color: Colors.white.withValues(alpha: .84),
                            fontSize: 14,
                            fontWeight: FontWeight.w500,
                            height: 1.35,
                            letterSpacing: .1,
                          ),
                        ),
                      ),
                      const Spacer(flex: 5),
                      Semantics(
                        label: l10n.loading,
                        child: Column(
                          children: [
                            Row(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                const SizedBox.square(
                                  dimension: 17,
                                  child: CircularProgressIndicator(
                                    strokeWidth: 2,
                                    color: Colors.white,
                                  ),
                                ),
                                const SizedBox(width: 10),
                                Flexible(
                                  child: Text(
                                    l10n.loading,
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: TextStyle(
                                      color: Colors.white.withValues(alpha: .8),
                                      fontSize: 13,
                                      fontWeight: FontWeight.w600,
                                    ),
                                  ),
                                ),
                              ],
                            ),
                            const SizedBox(height: 17),
                            ClipRRect(
                              borderRadius: BorderRadius.circular(99),
                              child: LinearProgressIndicator(
                                minHeight: 3,
                                backgroundColor:
                                    Colors.white.withValues(alpha: .18),
                                color: Colors.white,
                              ),
                            ),
                          ],
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

class _StartupOrb extends StatelessWidget {
  const _StartupOrb({required this.size, required this.opacity});

  final double size;
  final double opacity;

  @override
  Widget build(BuildContext context) {
    return IgnorePointer(
      child: Container(
        width: size,
        height: size,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          color: Colors.white.withValues(alpha: opacity),
          border: Border.all(
            color: Colors.white.withValues(alpha: opacity + .025),
          ),
        ),
      ),
    );
  }
}
