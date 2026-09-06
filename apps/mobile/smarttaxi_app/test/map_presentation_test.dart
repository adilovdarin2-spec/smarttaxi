import 'package:flutter_test/flutter_test.dart';
import 'package:maplibre_gl/maplibre_gl.dart' as native_map;
import 'package:smarttaxi_app/core/theme/app_theme.dart';
import 'package:smarttaxi_app/core/utils/map_layers.dart';

void main() {
  test('Native duplicate buildings use the supported visibility API', () async {
    for (final replacement in [
      'smarttaxi-3d-buildings',
      'smarttaxi-driver-3d-buildings',
    ]) {
      final controller = _LayerController(['building-3d', replacement]);
      await hideDuplicateLibertyBuildings(controller);
      expect(controller.visibilityChanges, [('building-3d', false)]);
    }
    final untouched = _LayerController(['building-3d']);
    await hideDuplicateLibertyBuildings(untouched);
    expect(untouched.visibilityChanges, isEmpty);
  });
  test('Liberty palette changes paint without changing geometry or visibility',
      () {
    for (final id in [
      'water',
      'building',
      'landuse_residential',
      'park',
      'landuse_school',
      'road_minor',
      'bridge_trunk_primary',
      'tunnel_motorway_casing',
      'waterway_river',
      'label_city',
      'poi_r1'
    ]) {
      final paint = libertyPresentationForLayer(id)!.toJson();
      expect(paint, isNotEmpty, reason: id);
      expect(
          paint.keys.every(
              (key) => key.endsWith('color') || key == 'text-halo-width'),
          isTrue,
          reason: id);
    }
    for (final id in [
      'smarttaxi-passenger-route-line',
      'road_one_way_arrow',
      'road_major_rail',
      'road_shield_us',
      'waterway_line_label',
      'custom-layer',
      'background'
    ]) {
      expect(libertyPresentationForLayer(id), isNull, reason: id);
    }
    expect(
        libertyPresentationForLayer('road_minor_casing')!
            .toJson()['line-color'],
        '#d9e2ef');
    expect(libertyPresentationForLayer('road_minor')!.toJson()['line-color'],
        '#ffffff');
  });

  test('Light and dark themes use the bundled typeface', () {
    for (final theme in [buildSmartTaxiTheme(), buildSmartTaxiDarkTheme()]) {
      expect(theme.textTheme.bodyMedium!.fontFamily, 'Inter');
      expect(theme.textTheme.titleLarge!.fontFamily, 'Inter');
    }
    expect(SmartTaxiColors.borderStrong, isNot(SmartTaxiColors.brand));
  });
}

class _LayerController extends Fake
    implements native_map.MapLibreMapController {
  _LayerController(this.ids);
  final List<String> ids;
  final visibilityChanges = <(String, bool)>[];

  @override
  Future<List<String>> getLayerIds() async => ids;

  @override
  Future<void> setLayerVisibility(String layerId, bool visible) async {
    visibilityChanges.add((layerId, visible));
  }
}
