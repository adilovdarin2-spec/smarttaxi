import 'package:flutter/material.dart';

/// The BaiSapar mark: a route running from an open origin ring to a gold
/// destination point on a navy field. Same artwork as the launcher icon and
/// the native launch drawable, so the app never changes face while it starts.
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
