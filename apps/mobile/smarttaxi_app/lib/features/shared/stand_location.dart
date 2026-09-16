import 'package:geolocator/geolocator.dart';
import 'models.dart';

/// Only an actual, recent, accurate device fix may join/renew a stand place.
/// Region centres and cached coordinates may sort the list but are not proof
/// of presence. Thirty seconds allows the parked-car 25-second heartbeat.
Coordinate? freshStandPosition(Position? position, DateTime now) {
  if (position == null ||
      !position.latitude.isFinite ||
      !position.longitude.isFinite ||
      position.latitude.abs() > 90 ||
      position.longitude.abs() > 180 ||
      !position.accuracy.isFinite ||
      position.accuracy < 0 ||
      position.accuracy > 60) {
    return null;
  }
  final age = now.difference(position.timestamp);
  if (age < const Duration(seconds: -5) || age > const Duration(seconds: 30)) {
    return null;
  }
  return Coordinate(lat: position.latitude, lng: position.longitude);
}
