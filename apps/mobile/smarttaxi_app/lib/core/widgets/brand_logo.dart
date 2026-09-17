import 'package:flutter/material.dart';

/// The supplied BaiSapar icon used only while the application starts.
///
/// Feature screens intentionally use the product name as text and never place
/// this launcher artwork in their content.
class BrandLogo extends StatelessWidget {
  const BrandLogo({
    super.key,
    this.large = false,
  });

  static const iconAssetPath = 'assets/brand/baisapar_app_icon.png';
  static const wordmarkLightAssetPath =
      'assets/brand/baisapar_wordmark_light.png';

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
