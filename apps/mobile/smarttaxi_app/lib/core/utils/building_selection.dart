import 'dart:convert';
import 'dart:ui';

import 'package:maplibre_gl/maplibre_gl.dart' as native_map;
import 'map_layers.dart';

/// Mirrors packages/shared/src/building-selection.js. Only existing polygon
/// geometry is accepted; bounding boxes do not identify L-shaped buildings.
Map<String, dynamic>? normalizeBuildingGeometry(dynamic value) {
  if (value is! Map || !['Polygon', 'MultiPolygon'].contains(value['type'])) {
    return null;
  }
  final polygons = value['type'] == 'Polygon'
      ? [value['coordinates']]
      : value['coordinates'];
  if (polygons is! List || polygons.isEmpty || polygons.length > 16) {
    return null;
  }
  var count = 0;
  final normalized = <List<List<List<double>>>>[];
  for (final polygon in polygons) {
    if (polygon is! List || polygon.isEmpty || polygon.length > 16) return null;
    final rings = <List<List<double>>>[];
    for (final ring in polygon) {
      if (ring is! List || ring.length < 4 || (count += ring.length) > 512) {
        return null;
      }
      final points = <List<double>>[];
      for (final point in ring) {
        if (point is! List ||
            point.length < 2 ||
            point[0] is! num ||
            point[1] is! num) {
          return null;
        }
        final lng = (point[0] as num).toDouble();
        final lat = (point[1] as num).toDouble();
        if (!lng.isFinite ||
            !lat.isFinite ||
            lng.abs() > 180 ||
            lat.abs() > 90) {
          return null;
        }
        points.add([
          double.parse(lng.toStringAsFixed(6)),
          double.parse(lat.toStringAsFixed(6))
        ]);
      }
      if (points.first[0] != points.last[0] ||
          points.first[1] != points.last[1]) {
        return null;
      }
      rings.add(points);
    }
    normalized.add(rings);
  }
  final geometry = <String, dynamic>{
    'type': value['type'],
    'coordinates': value['type'] == 'Polygon' ? normalized.first : normalized,
  };
  return jsonEncode(geometry).length <= 2500 ? geometry : null;
}

bool _inRing(double lat, double lng, List ring) {
  var inside = false;
  for (int i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    final x = (ring[i][0] as num).toDouble(),
        y = (ring[i][1] as num).toDouble();
    final xj = (ring[j][0] as num).toDouble(),
        yj = (ring[j][1] as num).toDouble();
    final dx = xj - x, dy = yj - y;
    final cross = (lng - x) * dy - (lat - y) * dx;
    if (cross.abs() < 1e-12 &&
        lng >= (x < xj ? x : xj) - 1e-10 &&
        lng <= (x > xj ? x : xj) + 1e-10 &&
        lat >= (y < yj ? y : yj) - 1e-10 &&
        lat <= (y > yj ? y : yj) + 1e-10) {
      return true;
    }
    if ((y > lat) != (yj > lat) && lng < dx * (lat - y) / dy + x) {
      inside = !inside;
    }
  }
  return inside;
}

bool pointInBuilding(double lat, double lng, Map<String, dynamic> geometry) {
  final polygons = geometry['type'] == 'Polygon'
      ? [geometry['coordinates']]
      : geometry['coordinates'] as List;
  return polygons.any((rings) =>
      _inRing(lat, lng, rings[0]) &&
      !(rings as List).skip(1).any((ring) => _inRing(lat, lng, ring)));
}

Future<Map<String, dynamic>?> buildingAtCameraTarget(
    native_map.MapLibreMapController controller,
    native_map.LatLng point) async {
  final layerIds = (await controller.getLayerIds())
      .map((id) => id.toString())
      .where((id) => [
            'building',
            'building-3d',
            'smarttaxi-3d-buildings',
            'smarttaxi-low-buildings'
          ].contains(id))
      .toList();
  if (layerIds.isEmpty) {
    return null; // custom/raster styles have no known footprint layer
  }
  final screen = await controller.toScreenLocation(point);
  final features = await controller.queryRenderedFeaturesInRect(
    Rect.fromCenter(
        center: Offset(screen.x.toDouble(), screen.y.toDouble()),
        // Only the footprint under the fixed picker can match. Keeping this
        // local avoids decoding a dense screenful of unrelated buildings on
        // mid-range Android devices before the 700 ms selection deadline.
        width: 48,
        height: 48),
    layerIds,
    null,
  );
  for (final feature in features.whereType<Map>()) {
    final geometry = buildingComponentAtPoint(
        feature['geometry'], point.latitude, point.longitude);
    if (geometry != null) return geometry;
  }
  return null;
}

Map<String, dynamic>? buildingComponentAtPoint(
    dynamic raw, double lat, double lng) {
  // OpenMapTiles can merge hundreds of separate houses in one MultiPolygon.
  // Send only the containing building, not its neighbours or the entire tile.
  final Iterable<dynamic> parts = raw is Map &&
          raw['type'] == 'MultiPolygon' &&
          raw['coordinates'] is List
      ? (raw['coordinates'] as List)
          .map((coordinates) => {'type': 'Polygon', 'coordinates': coordinates})
      : [raw];
  for (final part in parts) {
    final geometry = normalizeBuildingGeometry(part);
    if (geometry != null && pointInBuilding(lat, lng, geometry)) {
      return geometry;
    }
  }
  return null;
}

Future<void> paintSelectedBuilding(native_map.MapLibreMapController controller,
    Map<String, dynamic>? geometry) async {
  const source = 'smarttaxi-selected-building';
  final data = <String, dynamic>{
    'type': 'FeatureCollection',
    'features': [
      if (geometry != null)
        {
          'type': 'Feature',
          'properties': <String, dynamic>{},
          'geometry': geometry
        },
    ]
  };
  final sources = await controller.getSourceIds();
  if (sources.contains(source)) {
    await controller.setGeoJsonSource(source, data);
  } else {
    if (geometry == null) return;
    await controller.addGeoJsonSource(source, data);
  }
  final layers = await controller.getLayerIds();
  final anchor = await resolveLabelAnchorLayerId(controller);
  if (!layers.contains(source)) {
    await controller.addFillLayer(
        source,
        source,
        const native_map.FillLayerProperties(
            fillColor: '#1D6FFF', fillOpacity: 0.16),
        belowLayerId: anchor);
  }
  if (!layers.contains('$source-outline')) {
    await controller.addLineLayer(
        source,
        '$source-outline',
        const native_map.LineLayerProperties(
            lineColor: '#1D6FFF', lineWidth: 1.6),
        belowLayerId: anchor);
  }
}
