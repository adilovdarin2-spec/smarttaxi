import 'package:flutter/material.dart';

/// The geographic hit box must not stretch the car artwork to 64dp.
class MapVehicleMarker extends StatelessWidget {
  const MapVehicleMarker({
    super.key,
    required this.semanticLabel,
    required this.fallback,
    this.rotationRadians = 0,
    this.size = 32,
  });

  final String semanticLabel;
  final Widget fallback;
  final double rotationRadians;
  final double size;

  @override
  Widget build(BuildContext context) => Center(
        child: SizedBox.square(
          dimension: size,
          child: Semantics(
            label: semanticLabel,
            image: true,
            child: Transform.rotate(
              angle: rotationRadians,
              child: Image.asset(
                'assets/map/driver_car_topview_white.png',
                width: size,
                height: size,
                cacheWidth:
                    (size * MediaQuery.devicePixelRatioOf(context)).ceil(),
                fit: BoxFit.contain,
                errorBuilder: (_, __, ___) => fallback,
              ),
            ),
          ),
        ),
      );
}
