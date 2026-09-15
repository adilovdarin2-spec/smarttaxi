import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:smarttaxi_app/core/widgets/map_vehicle_marker.dart';

void main() {
  testWidgets('car stays 32dp and centered in a tight 64dp map marker',
      (tester) async {
    for (final angle in [0.0, math.pi / 2, math.pi]) {
      await tester.pumpWidget(MaterialApp(
        home: Center(
            child: SizedBox.square(
          key: const ValueKey('map-hit-box'),
          dimension: 64,
          child: MapVehicleMarker(
            semanticLabel: 'Ваша машина',
            rotationRadians: angle,
            fallback: const Icon(Icons.navigation),
          ),
        )),
      ));
      await tester.pumpAndSettle();
      final image = find.byType(Image);
      expect(tester.getSize(image), const Size(32, 32));
      expect(tester.getCenter(image),
          tester.getCenter(find.byKey(const ValueKey('map-hit-box'))));
      expect(tester.takeException(), isNull);
    }
  });
}
