import 'package:flutter/material.dart';
import '../../l10n/app_localizations.dart';
import '../theme/app_theme.dart';
import 'brand_logo.dart';

/// Same 96dp mark and background as the native Android launch drawable.
/// Startup/session restoration owns the duration; no artificial delay.
class StartupScreen extends StatelessWidget {
  const StartupScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    // Follows the theme rather than pinning the light background: on a phone
    // in dark mode the fixed colour turned this screen into a white flash
    // between the (now also dark) native launch screen and the app itself.
    final dark = Theme.of(context).brightness == Brightness.dark;
    return Scaffold(
      backgroundColor:
          dark ? SmartTaxiPalette.dark.appBackground : const Color(0xfff7fbff),
      body: LayoutBuilder(builder: (context, constraints) {
        return Stack(
          fit: StackFit.expand,
          children: [
            Center(
              child: Semantics(
                label: 'BaiSapar',
                child: const SizedBox.square(
                  dimension: 96,
                  child: Image(image: AssetImage(BrandLogo.iconAssetPath)),
                ),
              ),
            ),
            Positioned(
              top: constraints.maxHeight / 2 + 72,
              left: 24,
              right: 24,
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(l10n.appTagline,
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        color: dark
                            ? SmartTaxiPalette.dark.textSecondary
                            : SmartTaxiColors.textSecondary,
                        fontSize: 13,
                        fontWeight: FontWeight.w400,
                        height: 1.4,
                      )),
                  const SizedBox(height: 24),
                  SizedBox.square(
                    dimension: 20,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      color: SmartTaxiColors.brand,
                      semanticsLabel: l10n.loading,
                    ),
                  ),
                ],
              ),
            ),
          ],
        );
      }),
    );
  }
}
