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

  static const iconAssetPath = 'assets/brand/smarttaxi_app_icon_1024.png';
  static const horizontalAssetPath =
      'assets/brand/smarttaxi_logo_horizontal_transparent.png';

  final bool large;
  final bool horizontal;

  @override
  Widget build(BuildContext context) {
    if (horizontal) {
      final width = large ? 220.0 : 148.0;
      final height = large ? 74.0 : 42.0;
      return Semantics(
        label: 'SmartTaxi',
        child: SizedBox(
          width: width,
          height: height,
          child: Image.asset(
            horizontalAssetPath,
            fit: BoxFit.contain,
            cacheWidth: (width * 4).round(),
            filterQuality: FilterQuality.high,
            errorBuilder: (_, __, ___) => _HorizontalLogoFallback(
              width: width,
              height: height,
            ),
          ),
        ),
      );
    }

    final size = large ? 78.0 : 40.0;
    return Semantics(
      label: 'SmartTaxi',
      child: SizedBox.square(
        dimension: size,
        child: DecoratedBox(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(large ? 24 : 14),
            boxShadow: [
              BoxShadow(
                color: const Color(0xFFD4AF37).withValues(alpha: 0.20),
                blurRadius: large ? 22 : 12,
                offset: Offset(0, large ? 9 : 5),
              ),
            ],
          ),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(large ? 24 : 14),
            child: Image.asset(
              iconAssetPath,
              fit: BoxFit.contain,
              cacheWidth: (size * 5).round(),
              cacheHeight: (size * 5).round(),
              filterQuality: FilterQuality.high,
              errorBuilder: (_, __, ___) => _LogoFallbackMark(size: size),
            ),
          ),
        ),
      ),
    );
  }
}

class _LogoFallbackMark extends StatelessWidget {
  const _LogoFallbackMark({required this.size});

  final double size;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(size * 0.28),
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            Color(0xFFF4D37B),
            Color(0xFFD4AF37),
            Color(0xFF9B6814),
          ],
        ),
        boxShadow: [
          BoxShadow(
            color: const Color(0xFFD4AF37).withValues(alpha: 0.28),
            blurRadius: size * 0.36,
            offset: Offset(0, size * 0.12),
          ),
        ],
      ),
      child: Center(
        child: Text(
          'ST',
          style: TextStyle(
            color: const Color(0xFF080D12),
            fontSize: size * 0.34,
            fontWeight: FontWeight.w900,
            letterSpacing: -1,
          ),
        ),
      ),
    );
  }
}

class _HorizontalLogoFallback extends StatelessWidget {
  const _HorizontalLogoFallback({
    required this.width,
    required this.height,
  });

  final double width;
  final double height;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: width,
      height: height,
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          _LogoFallbackMark(size: height),
          const SizedBox(width: 10),
          const Text(
            'SmartTaxi',
            style: TextStyle(
              color: Color(0xFFF5F5F5),
              fontSize: 22,
              fontWeight: FontWeight.w900,
              letterSpacing: 0,
            ),
          ),
        ],
      ),
    );
  }
}
