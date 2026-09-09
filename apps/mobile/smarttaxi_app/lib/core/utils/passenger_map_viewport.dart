import 'dart:math' as math;

import 'package:flutter/widgets.dart';
import 'package:latlong2/latlong.dart';
import 'package:maplibre_gl/maplibre_gl.dart' as native_map;

/// Insets use the measured panel and actual map size, not full-screen height.
/// They reserve space for the route header and endpoint artwork as well.
EdgeInsets passengerRouteInsets(Size viewport, double panelHeight) {
  final height = math.max(1.0, viewport.height);
  final bottom =
      (panelHeight + 16).clamp(0.0, math.max(0.0, height - 48)).toDouble();
  // The floating ETA chip occupies the upper map band. Keep enough headroom
  // for the full square-and-tail pickup marker as well; 96dp left its badge
  // visibly tucked under the chip on the 360dp Xiaomi QA viewport.
  final top = math.min(128.0, math.max(0.0, height - bottom - 32));
  final side = math.min(44.0, math.max(0.0, (viewport.width - 32) / 2));
  return EdgeInsets.fromLTRB(side, top, side, bottom);
}

/// Move the map's center point into the unobscured area, retaining native
/// projection/zoom/pitch. Native MapLibre scrollBy translates the map content:
/// negative Y moves the pickup upward (unlike scrolling a document viewport).
double passengerPointScrollY(Size viewport, double panelHeight) {
  final padding = passengerRouteInsets(viewport, panelHeight);
  return (padding.top - padding.bottom) / 2;
}

/// Fit an overview from a predictable projection. On the physical Android
/// map a bounds update from a pitched camera can leave an endpoint outside
/// the viewport when the sheet collapses. Normalize *before* fitting, never
/// reapply a camera position afterwards (which loses asymmetric framing).
/// A newer route/panel request supersedes either asynchronous step.
Future<bool> fitPassengerRouteOverview({
  required native_map.CameraPosition current,
  required Iterable<LatLng> points,
  required Size viewport,
  required double panelHeight,
  required Future<bool?> Function(native_map.CameraUpdate) moveCamera,
  required Future<bool?> Function(native_map.CameraUpdate) animateCamera,
  required bool Function() isCurrent,
}) async {
  final bounds = passengerRouteBounds(points);
  final padding = passengerRouteInsets(viewport, panelHeight);
  if (!isCurrent()) return false;
  if (current.tilt.abs() > 0.01 || current.bearing.abs() > 0.01) {
    await moveCamera(native_map.CameraUpdate.newCameraPosition(
      native_map.CameraPosition(target: current.target, zoom: current.zoom),
    ));
    if (!isCurrent()) return false;
  }
  final moved = await animateCamera(native_map.CameraUpdate.newLatLngBounds(
    bounds,
    left: padding.left,
    top: padding.top,
    right: padding.right,
    bottom: padding.bottom,
  ));
  return moved != false && isCurrent();
}

native_map.LatLngBounds passengerRouteBounds(Iterable<LatLng> points) {
  final valid = points
      .where((point) =>
          point.latitude.isFinite &&
          point.longitude.isFinite &&
          point.latitude.abs() <= 90 &&
          point.longitude.abs() <= 180)
      .toList();
  if (valid.isEmpty) throw ArgumentError('A route needs valid coordinates');
  var south = valid.first.latitude;
  var north = south;
  var west = valid.first.longitude;
  var east = west;
  for (final point in valid.skip(1)) {
    south = math.min(south, point.latitude);
    north = math.max(north, point.latitude);
    west = math.min(west, point.longitude);
    east = math.max(east, point.longitude);
  }
  // Same-point or almost horizontal/vertical routes must not fit to zoom 25.
  if (north - south < 0.0002) {
    south = math.max(-90.0, south - 0.0001);
    north = math.min(90.0, north + 0.0001);
  }
  if (east - west < 0.0002) {
    west = math.max(-180.0, west - 0.0001);
    east = math.min(180.0, east + 0.0001);
  }
  return native_map.LatLngBounds(
    southwest: native_map.LatLng(south, west),
    northeast: native_map.LatLng(north, east),
  );
}
