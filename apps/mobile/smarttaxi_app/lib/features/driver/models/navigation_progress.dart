import 'dart:math' as math;

import 'package:latlong2/latlong.dart';
import '../../shared/models.dart';

/// Distances are measured along the road, never across a block or hairpin.
class NavigationProgress {
  const NavigationProgress(
      {required this.alongMeters,
      required this.totalMeters,
      required this.distanceFromRoute,
      required this.distanceMeters,
      required this.durationSeconds});
  final double alongMeters;
  final double totalMeters;
  final double distanceFromRoute;
  final double distanceMeters;
  final double durationSeconds;
}

const _earthRadius = 6371000.0;
double _meters(LatLng a, LatLng b) {
  final lat = (b.latitude - a.latitude) * math.pi / 180;
  final lng = (b.longitude - a.longitude) * math.pi / 180;
  final h = math.pow(math.sin(lat / 2), 2) +
      math.cos(a.latitude * math.pi / 180) *
          math.cos(b.latitude * math.pi / 180) *
          math.pow(math.sin(lng / 2), 2);
  return 2 * _earthRadius * math.asin(math.sqrt(h.clamp(0.0, 1.0)));
}

({double along, double distance, double total}) _project(
    List<LatLng> line, LatLng point,
    {double? expectedAlong, double minimumAlong = 0}) {
  var total = 0.0, bestAlong = 0.0, bestDistance = double.infinity;
  final cosLat = math.cos(point.latitude * math.pi / 180);
  for (var i = 0; i < line.length - 1; i++) {
    final a = line[i], b = line[i + 1];
    final segment = _meters(a, b);
    final dx = (b.longitude - a.longitude) * cosLat;
    final dy = b.latitude - a.latitude;
    final px = (point.longitude - a.longitude) * cosLat;
    final py = point.latitude - a.latitude;
    final length2 = dx * dx + dy * dy;
    final t =
        length2 == 0 ? 0.0 : ((px * dx + py * dy) / length2).clamp(0.0, 1.0);
    final along = total + segment * t;
    final projected = LatLng(
        a.latitude + dy * t, a.longitude + (b.longitude - a.longitude) * t);
    final distance = _meters(point, projected);
    final tied = (distance - bestDistance).abs() < 0.5;
    if (along >= minimumAlong - 0.5 &&
        (distance < bestDistance - 0.5 ||
            (tied &&
                expectedAlong != null &&
                (along - expectedAlong).abs() <
                    (bestAlong - expectedAlong).abs()))) {
      bestDistance = distance;
      bestAlong = along;
    }
    total += segment;
  }
  return (along: bestAlong, distance: bestDistance, total: total);
}

NavigationProgress? navigationProgress(
    RoutePreview route, Coordinate position) {
  if (route.isFallback ||
      route.geometry.length < 2 ||
      !position.lat.isFinite ||
      !position.lng.isFinite) {
    return null;
  }
  final p = _project(route.geometry, position.toLatLng());
  // The reroute threshold is 60m. Do not continue issuing instructions from
  // the old road while waiting for its replacement.
  if (p.distance > 60 || p.total <= 0) return null;
  final fraction = ((p.total - p.along) / p.total).clamp(0.0, 1.0);
  return NavigationProgress(
      alongMeters: p.along,
      totalMeters: p.total,
      distanceFromRoute: p.distance,
      distanceMeters: route.distanceMeters * fraction,
      durationSeconds: route.durationSeconds * fraction);
}

({RouteStep step, double distanceMeters})? nextNavigationStep(
    RoutePreview route, NavigationProgress progress) {
  if (route.isFallback) return null;
  final stepTotal =
      route.steps.fold(0.0, (sum, step) => sum + step.distanceMeters);
  var traversed = 0.0, previousAnchor = 0.0;
  for (final step in route.steps) {
    final expected = step.type == 'arrive'
        ? progress.totalMeters
        : stepTotal > 0
            ? traversed / stepTotal * progress.totalMeters
            : null;
    final anchor = _project(route.geometry, step.location.toLatLng(),
        expectedAlong: expected, minimumAlong: previousAnchor);
    traversed += step.distanceMeters;
    if (!anchor.distance.isFinite || anchor.distance > 30) continue;
    previousAnchor = anchor.along;
    if (step.type == 'depart' || anchor.along < progress.alongMeters - 5) {
      continue;
    }
    return (
      step: step,
      distanceMeters: math.max(0, anchor.along - progress.alongMeters) *
          route.distanceMeters /
          progress.totalMeters
    );
  }
  return null;
}

bool navigationFixIsFresh(DateTime? timestamp, DateTime now) {
  if (timestamp == null) return false;
  final age = now.difference(timestamp);
  return age >= const Duration(seconds: -5) &&
      age <= const Duration(seconds: 12);
}

/// An immediate instruction takes precedence even if the navigator was opened
/// only 15m before the turn; never announce "in 200m" at that point.
int navigationAnnouncementStage(double distanceMeters, int previousStage) {
  if (!distanceMeters.isFinite || distanceMeters < 0) return previousStage;
  if (distanceMeters <= 40) return 2;
  if (distanceMeters <= 200 && previousStage < 1) return 1;
  return previousStage;
}
