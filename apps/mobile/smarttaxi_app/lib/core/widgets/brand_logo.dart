import 'package:flutter/material.dart';

class BrandLogo extends StatelessWidget {
  const BrandLogo({
    super.key,
    this.large = false,
    this.horizontal = false,
  });

  const BrandLogo.horizontal({
    super.key,
    this.large = false,
  }) : horizontal = true;

  // Raster PNGs (not the earlier hand-authored SVGs) — the wordmark SVG had
  // its "Smart" half filled pure white, invisible on every light-background
  // screen it's placed on. These are the car/checker-light mark supplied
  // directly by the client.
  static const iconAssetPath = 'assets/brand/smarttaxi_app_icon_2026.png';
  static const horizontalAssetPath = 'assets/brand/smarttaxi_wordmark_2026.png';

  final bool large;
  final bool horizontal;

  @override
  Widget build(BuildContext context) {
    if (horizontal) {
      final width = large ? 220.0 : 148.0;
      final height = large ? 72.4 : 48.7;
      return Semantics(
        label: 'SmartTaxi',
        child: SizedBox(
          width: width,
          height: height,
          child: Image.asset(horizontalAssetPath, fit: BoxFit.contain),
        ),
      );
    }

    final size = large ? 78.0 : 46.0;
    return Semantics(
      label: 'SmartTaxi',
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
