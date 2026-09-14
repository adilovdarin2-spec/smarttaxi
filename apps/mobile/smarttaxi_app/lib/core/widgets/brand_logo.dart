import 'package:flutter/material.dart';

/// The BaiSapar mark: the name's own B, cut through by the road.
///
/// Same artwork as the launcher icon and the native launch drawable, so the
/// app never changes face while it starts.
class BrandLogo extends StatelessWidget {
  const BrandLogo({
    super.key,
    this.large = false,
  });

  // A raster PNG rather than an SVG: the app has no SVG renderer on the
  // startup path, and this is drawn before the first frame of real UI.
  static const iconAssetPath = 'assets/brand/baisapar_app_icon.png';

  final bool large;

  @override
  Widget build(BuildContext context) {
    final size = large ? 78.0 : 46.0;
    return Semantics(
      label: 'BaiSapar',
      child: ClipRRect(
        borderRadius: BorderRadius.circular(large ? 20 : 12),
        child: SizedBox.square(
          dimension: size,
          child: Image.asset(iconAssetPath, fit: BoxFit.cover),
        ),
      ),
    );
  }
}

/// The logotype on its own — outlined letterforms, not text.
///
/// Shipping it as artwork is the point: set as a Text widget it drifts with
/// whatever font and weight the surrounding theme happens to carry, which is
/// how the auth screen ended up wearing a different logo from the rest of the
/// app. Two files, because gold-on-white and white-on-photo need different
/// ink rather than an opacity trick.
class BrandWordmark extends StatelessWidget {
  const BrandWordmark({
    super.key,
    this.onDark,
    this.height = 34,
  });

  static const darkAssetPath = 'assets/brand/baisapar_wordmark.png';
  static const lightAssetPath = 'assets/brand/baisapar_wordmark_light.png';

  /// True when the logotype sits on a dark ground and must be drawn light.
  /// Left null it follows the theme, which is right everywhere except over
  /// artwork — the auth backdrop is a photograph in both themes.
  final bool? onDark;
  final double height;

  @override
  Widget build(BuildContext context) {
    final light = onDark ?? Theme.of(context).brightness == Brightness.dark;
    return Semantics(
      label: 'BaiSapar',
      child: Image.asset(
        light ? lightAssetPath : darkAssetPath,
        height: height,
        fit: BoxFit.contain,
        filterQuality: FilterQuality.medium,
      ),
    );
  }
}

/// Mark and logotype side by side, in the proportions the lockup keeps
/// everywhere it appears.
class BrandLockup extends StatelessWidget {
  const BrandLockup({
    super.key,
    this.onDark,
    this.height = 44,
  });

  final bool? onDark;
  final double height;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: 'BaiSapar',
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          ClipRRect(
            borderRadius: BorderRadius.circular(height * 0.23),
            child: SizedBox.square(
              dimension: height,
              child: Image.asset(BrandLogo.iconAssetPath, fit: BoxFit.cover),
            ),
          ),
          SizedBox(width: height * 0.3),
          ExcludeSemantics(
            child: BrandWordmark(onDark: onDark, height: height * 0.52),
          ),
        ],
      ),
    );
  }
}
