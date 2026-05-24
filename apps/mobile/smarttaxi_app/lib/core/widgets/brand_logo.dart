import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';

class BrandLogo extends StatelessWidget {
  const BrandLogo({super.key, this.large = false});

  final bool large;

  @override
  Widget build(BuildContext context) {
    final size = large ? 88.0 : 36.0;
    final fallback = _LogoFallbackMark(size: size);
    return SizedBox(
      width: size,
      height: size,
      child: SvgPicture.asset(
        'assets/brand/smarttaxi_icon.svg',
        fit: BoxFit.contain,
        semanticsLabel: 'SmartTaxi',
        placeholderBuilder: (_) => fallback,
        errorBuilder: (_, __, ___) => fallback,
      ),
    );
  }
}

class _LogoFallbackMark extends StatelessWidget {
  const _LogoFallbackMark({required this.size});

  final double size;

  @override
  Widget build(BuildContext context) {
    final borderWidth = (size * 0.08).clamp(2.0, 6.0).toDouble();
    return Semantics(
      label: 'SmartTaxi',
      child: Container(
        width: size,
        height: size,
        decoration: BoxDecoration(
          color: const Color(0xFFC99A2E),
          shape: BoxShape.circle,
          border: Border.all(
            color: const Color(0xFFA97814),
            width: borderWidth,
          ),
        ),
        child: Center(
          child: Icon(
            Icons.near_me_rounded,
            color: const Color(0xFF141414),
            size: size * 0.52,
          ),
        ),
      ),
    );
  }
}
