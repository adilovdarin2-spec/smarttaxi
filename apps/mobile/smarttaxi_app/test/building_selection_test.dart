import 'package:flutter_test/flutter_test.dart';
import 'package:maplibre_gl/maplibre_gl.dart' as native_map;
import 'package:smarttaxi_app/core/utils/building_selection.dart';
import 'dart:math' as math;
import 'dart:ui';

void main() {
  final outline = [
    [68, 40],
    [68.003, 40],
    [68.003, 40.001],
    [68.001, 40.001],
    [68.001, 40.003],
    [68, 40.003],
    [68, 40]
  ];
  final hole = [
    [68.0002, 40.0002],
    [68.0008, 40.0002],
    [68.0008, 40.0008],
    [68.0002, 40.0008],
    [68.0002, 40.0002]
  ];
  final raw = {
    'type': 'Polygon',
    'coordinates': [outline, hole]
  };
  test('selected-building overlay preserves the actual geometry below labels',
      () async {
    final controller = _BuildingMap();
    final geometry = normalizeBuildingGeometry(raw)!;
    await paintSelectedBuilding(controller, geometry);
    expect(controller.data!['features'][0]['geometry'], geometry);
    final layers = controller.calls.where((call) =>
        call.memberName == #addFillLayer || call.memberName == #addLineLayer);
    expect(layers.length, 2);
    expect(
        layers
            .every((call) => call.namedArguments[#belowLayerId] == 'road_name'),
        isTrue);
    await paintSelectedBuilding(controller, null);
    expect(controller.data!['features'], isEmpty);
    expect(
        controller.calls
            .where((call) => call.memberName == #addGeoJsonSource)
            .length,
        1);
  });
  test('merged vector tile selects one component, not every house', () {
    final other = [
      [
        [69, 41],
        [69.001, 41],
        [69.001, 41.001],
        [69, 41.001],
        [69, 41]
      ]
    ];
    final merged = {
      'type': 'MultiPolygon',
      'coordinates': [...List.filled(100, other), raw['coordinates']]
    };
    expect(normalizeBuildingGeometry(merged), isNull);
    expect(buildingComponentAtPoint(merged, 40.002, 68.0005),
        normalizeBuildingGeometry(raw));
  });
  test('camera picker queries only the local building area', () async {
    final controller = _BuildingQueryMap(raw);
    final selected = await buildingAtCameraTarget(
        controller, const native_map.LatLng(40.002, 68.0005));
    expect(selected, normalizeBuildingGeometry(raw));
    expect(controller.queryRect, isNotNull);
    expect(controller.queryRect!.width, 48);
    expect(controller.queryRect!.height, 48);
    expect(controller.queryRect!.center, const Offset(180, 260));
  });
  test('selected footprint excludes L-shaped notch and inner courtyard', () {
    final geometry = normalizeBuildingGeometry(raw)!;
    expect(pointInBuilding(40.002, 68.0005, geometry), isTrue);
    expect(pointInBuilding(40.002, 68.002, geometry), isFalse);
    expect(pointInBuilding(40.0005, 68.0005, geometry), isFalse);
    expect(pointInBuilding(40.002, 68, geometry), isTrue);
  });
  test('only finite, closed polygons and multipolygons are supported', () {
    for (final invalid in [
      null,
      {
        'type': 'Point',
        'coordinates': [68, 40]
      },
      {
        'type': 'Polygon',
        'coordinates': [outline.sublist(0, outline.length - 1)]
      },
      {
        'type': 'Polygon',
        'coordinates': [
          [
            [double.infinity, 40],
            [68, 40],
            [68, 40.1],
            [double.infinity, 40]
          ]
        ]
      }
    ]) {
      expect(normalizeBuildingGeometry(invalid), isNull);
    }
    final multi = normalizeBuildingGeometry({
      'type': 'MultiPolygon',
      'coordinates': [raw['coordinates']]
    })!;
    expect(pointInBuilding(40.002, 68.0005, multi), isTrue);
  });
}

class _BuildingQueryMap extends Fake
    implements native_map.MapLibreMapController {
  _BuildingQueryMap(this.geometry);

  final Map<String, dynamic> geometry;
  Rect? queryRect;

  @override
  dynamic noSuchMethod(Invocation invocation) {
    if (invocation.memberName == #getLayerIds) {
      return Future.value(<String>['building', 'road_name']);
    }
    if (invocation.memberName == #toScreenLocation) {
      return Future.value(const math.Point<double>(180, 260));
    }
    if (invocation.memberName == #queryRenderedFeaturesInRect) {
      queryRect = invocation.positionalArguments[0] as Rect;
      expect(invocation.positionalArguments[1], <String>['building']);
      return Future.value(<Map<String, dynamic>>[
        {'geometry': geometry}
      ]);
    }
    return super.noSuchMethod(invocation);
  }
}

class _BuildingMap extends Fake implements native_map.MapLibreMapController {
  final calls = <Invocation>[];
  final sources = <String>[];
  final layers = <String>['building', 'road_name'];
  Map<String, dynamic>? data;

  @override
  dynamic noSuchMethod(Invocation invocation) {
    calls.add(invocation);
    if (invocation.memberName == #getSourceIds) return Future.value(sources);
    if (invocation.memberName == #getLayerIds) return Future.value(layers);
    if (invocation.memberName == #addGeoJsonSource ||
        invocation.memberName == #setGeoJsonSource) {
      final id = invocation.positionalArguments[0] as String;
      if (!sources.contains(id)) sources.add(id);
      data = invocation.positionalArguments[1] as Map<String, dynamic>;
      return Future<void>.value();
    }
    if (invocation.memberName == #addFillLayer ||
        invocation.memberName == #addLineLayer) {
      layers.add(invocation.positionalArguments[1] as String);
      return Future<void>.value();
    }
    return super.noSuchMethod(invocation);
  }
}
