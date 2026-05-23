import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';

class BrandLogo extends StatelessWidget {
  const BrandLogo({super.key, this.large = false});

  final bool large;

  @override
  Widget build(BuildContext context) {
    final size = large ? 88.0 : 36.0;
    return SizedBox(
      width: size,
      height: size,
      child: SvgPicture.asset(
        'assets/brand/smarttaxi_icon.svg',
        fit: BoxFit.contain,
        semanticsLabel: 'SmartTaxi',
      ),
    );
  }
}
