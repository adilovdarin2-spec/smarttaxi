import 'package:flutter_test/flutter_test.dart';
import 'package:geolocator/geolocator.dart';
import 'package:smarttaxi_app/features/shared/stand_location.dart';

void main() {
  final now = DateTime.utc(2026, 9, 16, 12);
  Position fix(
          {int ageMs = 0,
          double accuracy = 8,
          double lat = 40.8458,
          double lng = 68.5041}) =>
      Position(
          latitude: lat,
          longitude: lng,
          timestamp: now.subtract(Duration(milliseconds: ageMs)),
          accuracy: accuracy,
          altitude: 0,
          altitudeAccuracy: 0,
          heading: 0,
          headingAccuracy: 0,
          speed: 0,
          speedAccuracy: 0);

  test('fresh accurate sensor position survives a parked 25 second heartbeat',
      () {
    for (final age in [0, 25000, 30000, -5000]) {
      final point = freshStandPosition(fix(ageMs: age), now);
      expect(point?.lat, 40.8458);
      expect(point?.lng, 68.5041);
    }
  });
  test('missing, old or future sensor fix cannot join or renew presence', () {
    for (final position in [null, fix(ageMs: 30001), fix(ageMs: -5001)]) {
      expect(freshStandPosition(position, now), isNull);
    }
  });
  test('coarse and invalid coordinates cannot join or renew presence', () {
    for (final position in [
      fix(accuracy: 61),
      fix(accuracy: -1),
      fix(accuracy: double.nan),
      fix(lat: 91),
      fix(lng: -181),
      fix(lat: double.infinity)
    ]) {
      expect(freshStandPosition(position, now), isNull);
    }
    expect(freshStandPosition(fix(accuracy: 60), now), isNotNull);
  });
}
