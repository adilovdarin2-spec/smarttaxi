import 'package:flutter_test/flutter_test.dart';
import 'package:latlong2/latlong.dart';
import 'package:smarttaxi_app/features/driver/models/navigation_progress.dart';
import 'package:smarttaxi_app/features/shared/models.dart';

RouteStep step(String type, double lat, double lng, double distance) =>
    RouteStep(
        type: type,
        modifier: 'right',
        streetName: 'Улица',
        distanceMeters: distance,
        location: Coordinate(lat: lat, lng: lng));
RoutePreview route(List<LatLng> points,
        {List<RouteStep> steps = const [], bool fallback = false}) =>
    RoutePreview(
        regionId: 'fixture',
        geometry: points,
        distanceMeters: 300,
        durationSeconds: 180,
        steps: steps,
        isFallback: fallback);
const bend = [
  LatLng(0, 0),
  LatLng(0, .001),
  LatLng(.001, .001),
  LatLng(.001, 0)
];

void main() {
  test('distance to a turn follows the road around a block, not the shortcut',
      () {
    final r = route(bend,
        steps: [step('depart', 0, 0, 300), step('arrive', .001, 0, 0)]);
    final p = navigationProgress(r, const Coordinate(lat: 0, lng: .0005))!;
    expect(p.distanceMeters, closeTo(250, .1));
    expect(p.durationSeconds, closeTo(150, .1));
    expect(nextNavigationStep(r, p)!.distanceMeters, closeTo(250, .1));
  });
  test('lateral GPS error is not added to the remaining road distance', () {
    final r = route(bend);
    final a = navigationProgress(r, const Coordinate(lat: 0, lng: .0005))!;
    final b = navigationProgress(r, const Coordinate(lat: .0001, lng: .0005))!;
    expect(b.distanceMeters, closeTo(a.distanceMeters, .1));
    expect(b.distanceFromRoute, closeTo(11.12, .1));
  });
  test('a turn just passed is removed before reaching the next vertex', () {
    final r = route(bend, steps: [
      step('depart', 0, 0, 100),
      step('turn', 0, .001, 100),
      step('turn', .001, .001, 100),
      step('arrive', .001, 0, 0)
    ]);
    final p = navigationProgress(r, const Coordinate(lat: .0002, lng: .001))!;
    final next = nextNavigationStep(r, p)!;
    expect(next.step.location.lat, .001);
    expect(next.distanceMeters, closeTo(80, .1));
  });
  test('arrival at a repeated coordinate uses the last route occurrence', () {
    final r = route([...bend, const LatLng(0, 0)],
        steps: [step('depart', 0, 0, 300), step('arrive', 0, 0, 0)]);
    final p = navigationProgress(r, const Coordinate(lat: 0, lng: 0))!;
    expect(nextNavigationStep(r, p)!.distanceMeters, closeTo(300, .1));
  });
  test('two-point route supports a real arrival step', () {
    final r = route(bend.take(2).toList(),
        steps: [step('depart', 0, 0, 300), step('arrive', 0, .001, 0)]);
    final p = navigationProgress(r, const Coordinate(lat: 0, lng: .0009))!;
    expect(nextNavigationStep(r, p)!.step.type, 'arrive');
    expect(p.distanceMeters, closeTo(30, .1));
  });
  test('no false instructions off route, on fallback or without real steps',
      () {
    expect(
        navigationProgress(route(bend), const Coordinate(lat: .004, lng: .004)),
        isNull);
    expect(
        navigationProgress(
            route(bend, fallback: true), const Coordinate(lat: 0, lng: 0)),
        isNull);
    final r = route(bend);
    expect(
        nextNavigationStep(
            r, navigationProgress(r, const Coordinate(lat: 0, lng: 0))!),
        isNull);
    expect(
        navigationProgress(route([const LatLng(0, 0), const LatLng(0, 0)]),
            const Coordinate(lat: 0, lng: 0)),
        isNull);
  });
  test('GPS freshness expires without a new sensor timestamp', () {
    final fix = DateTime.utc(2026, 9, 9);
    expect(
        navigationFixIsFresh(fix, fix.add(const Duration(seconds: 3))), isTrue);
    expect(navigationFixIsFresh(fix, fix.add(const Duration(seconds: 13))),
        isFalse);
    expect(navigationFixIsFresh(null, fix), isFalse);
    expect(navigationFixIsFresh(fix.add(const Duration(minutes: 5)), fix),
        isFalse);
    final stationaryFix = fix.add(const Duration(seconds: 15));
    expect(navigationFixIsFresh(stationaryFix, stationaryFix), isTrue);
  });
  test('immediate voice cue wins over preparation on opening near a turn', () {
    expect(navigationAnnouncementStage(15, 0), 2);
    expect(navigationAnnouncementStage(120, 0), 1);
    expect(navigationAnnouncementStage(20, 1), 2);
    expect(navigationAnnouncementStage(15, 2), 2);
    expect(navigationAnnouncementStage(220, 0), 0);
  });
}
