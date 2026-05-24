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
    return Semantics(
      label: 'SmartTaxi',
      child: SizedBox(
        width: size,
        height: size,
        child: CustomPaint(painter: _LogoFallbackPainter()),
      ),
    );
  }
}

class _LogoFallbackPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final rect = Offset.zero & size;
    final w = size.width;
    final h = size.height;

    final gold = Paint()
      ..shader = const LinearGradient(
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
        colors: [
          Color(0xFFF8E7B4),
          Color(0xFFC99A2E),
          Color(0xFFA97814),
        ],
      ).createShader(rect);
    final warm = Paint()..color = const Color(0xFFFFFCF6);
    final ink = Paint()
      ..color = const Color(0xFF141414)
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round
      ..strokeWidth = w * 0.095;

    canvas.drawOval(
      Rect.fromCenter(
        center: Offset(w * 0.5, h * 0.48),
        width: w * 0.92,
        height: h * 0.92,
      ),
      gold,
    );

    canvas.drawOval(
      Rect.fromCenter(
        center: Offset(w * 0.5, h * 0.48),
        width: w * 0.66,
        height: h * 0.66,
      ),
      warm,
    );

    final roadTop = Path()
      ..moveTo(w * 0.25, h * 0.52)
      ..cubicTo(w * 0.38, h * 0.34, w * 0.57, h * 0.32, w * 0.76, h * 0.42);
    canvas.drawPath(roadTop, ink);

    final roadBottom = Path()
      ..moveTo(w * 0.24, h * 0.64)
      ..cubicTo(w * 0.40, h * 0.52, w * 0.56, h * 0.49, w * 0.72, h * 0.51);
    canvas.drawPath(roadBottom, ink);

    canvas.drawCircle(
      Offset(w * 0.25, h * 0.64),
      w * 0.055,
      Paint()..color = const Color(0xFF141414),
    );

    final center = Paint()
      ..shader = const LinearGradient(
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
        colors: [Color(0xFFF6E6B8), Color(0xFFA97814)],
      ).createShader(rect);
    canvas.drawCircle(Offset(w * 0.50, h * 0.48), w * 0.11, center);
    canvas.drawCircle(Offset(w * 0.50, h * 0.48), w * 0.044, warm);

    final arrow = Path()
      ..moveTo(w * 0.68, h * 0.34)
      ..lineTo(w * 0.88, h * 0.44)
      ..lineTo(w * 0.69, h * 0.53);
    canvas.drawPath(arrow, ink);

    final point = Path()
      ..moveTo(w * 0.42, h * 0.88)
      ..quadraticBezierTo(w * 0.50, h * 0.98, w * 0.58, h * 0.88)
      ..close();
    canvas.drawPath(point, gold);
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
