import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:latlong2/latlong.dart';
import 'package:smarttaxi_app/core/utils/passenger_map_viewport.dart';
import 'package:smarttaxi_app/core/widgets/measure_size.dart';

void main() {
  test('physical 360dp phone route stays above its 541dp panel', () {
    final padding = passengerRouteInsets(const Size(360, 739), 541);
    expect(padding.bottom, 557);
    expect(padding.top, 96);
    expect(739 - padding.bottom, lessThan(739 - 541));
    expect(739 - padding.vertical, greaterThan(60));
    expect(360 - padding.horizontal, greaterThan(200));
  });

  test('collapsed panel releases the map and small viewports remain valid', () {
    final expanded = passengerRouteInsets(const Size(390, 760), 520);
    final collapsed = passengerRouteInsets(const Size(390, 760), 54);
    expect(collapsed.bottom, lessThan(expanded.bottom));
    for (final size in [const Size(360, 240), const Size(100, 100)]) {
      final padding = passengerRouteInsets(size, 600);
      expect(padding.vertical, lessThan(size.height));
      expect(padding.horizontal, lessThan(size.width));
    }
  });

  test('bounds include route bends, not only origin and destination', () {
    final bounds = passengerRouteBounds([
      const LatLng(40.66, 68.54),
      const LatLng(40.68, 68.56),
      const LatLng(40.665, 68.545),
    ]);
    expect(bounds.southwest.latitude, 40.66);
    expect(bounds.northeast.latitude, 40.68);
    expect(bounds.northeast.longitude, 68.56);
    final point = passengerRouteBounds([const LatLng(40.66, 68.54)]);
    expect(point.northeast.latitude, greaterThan(point.southwest.latitude));
    expect(point.northeast.longitude, greaterThan(point.southwest.longitude));
    expect(() => passengerRouteBounds([]), throwsArgumentError);
  });

  testWidgets('panel measurement follows resize without a rebuild loop',
      (tester) async {
    final sizes = <Size>[];
    Widget frame(double height) => Directionality(
          textDirection: TextDirection.ltr,
          child: Align(
              alignment: Alignment.bottomCenter,
              child: MeasureSize(
                onChange: sizes.add,
                child: SizedBox(width: 360, height: height),
              )),
        );
    await tester.pumpWidget(frame(500));
    await tester.pump();
    expect(sizes, [const Size(360, 500)]);
    await tester.pumpWidget(frame(54));
    await tester.pump();
    expect(sizes, [const Size(360, 500), const Size(360, 54)]);
    await tester.pump();
    expect(sizes.length, 2);
  });
}
