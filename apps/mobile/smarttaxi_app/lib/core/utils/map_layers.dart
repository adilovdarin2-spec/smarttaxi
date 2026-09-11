import 'package:maplibre_gl/maplibre_gl.dart' as native_map;

/// Presentation-only overrides for the known Liberty basemap. No source,
/// geometry, filters, road widths or label visibility is replaced.
native_map.LayerProperties? libertyPresentationForLayer(String id) {
  // maplibre_gl 0.21 Android cannot set background paint at runtime. Leave
  // that provider layer intact rather than swallowing an unsupported call.
  if (id == 'water') {
    return const native_map.FillLayerProperties(fillColor: '#b9d8f5');
  }
  if (id == 'building') {
    return const native_map.FillLayerProperties(
        fillColor: '#e4ebf6', fillOutlineColor: '#d6dfec');
  }
  if (id == 'landuse_residential') {
    return const native_map.FillLayerProperties(fillColor: '#eef2f7');
  }
  if ([
    'park',
    'landcover_wood',
    'landcover_grass',
    'landuse_pitch',
    'landuse_track',
    'landuse_cemetery'
  ].contains(id)) {
    return const native_map.FillLayerProperties(fillColor: '#dcebe3');
  }
  if (['landuse_hospital', 'landuse_school', 'landcover_sand', 'aeroway_fill']
      .contains(id)) {
    return const native_map.FillLayerProperties(fillColor: '#edf0f6');
  }
  if (id.startsWith('waterway_') && !id.contains('label')) {
    return const native_map.LineLayerProperties(lineColor: '#aacbeb');
  }
  if (RegExp(r'^(road|tunnel|bridge)_').hasMatch(id) &&
      !RegExp(r'rail|arrow|shield|area').hasMatch(id)) {
    return native_map.LineLayerProperties(
        lineColor: id.endsWith('_casing')
            ? '#d2deed'
            : id.contains('motorway') || id.contains('trunk')
                ? '#e3edfb'
                : '#ffffff');
  }
  if (id.startsWith('label_') ||
      id.startsWith('highway-name-') ||
      id.startsWith('poi_')) {
    return const native_map.SymbolLayerProperties(
        textColor: '#50627a', textHaloColor: '#ffffff', textHaloWidth: 1.35);
  }
  return null;
}

Future<void> applyLibertyPresentation(
    native_map.MapLibreMapController controller) async {
  try {
    final ids =
        (await controller.getLayerIds()).map((id) => id.toString()).toSet();
    // Do not recolor a configured MapTiler/custom style by coincidental ids.
    if (!ids.contains('landuse_residential') ||
        !ids.contains('road_one_way_arrow') ||
        !ids.contains('building-3d')) {
      return;
    }
    for (final id in ids) {
      final properties = libertyPresentationForLayer(id);
      if (properties != null) {
        try {
          await controller.setLayerProperties(id, properties);
        } catch (_) {}
      }
    }
  } catch (_) {
    // A provider/style reload must not block the map or booking controls.
  }
}

/// Call only AFTER our label-safe extrusion was successfully added. Liberty
/// already includes a grey building-3d layer: keeping both causes doubled,
/// dark buildings, even when our own extrusion has the correct blue tint.
Future<void> hideDuplicateLibertyBuildings(
    native_map.MapLibreMapController controller) async {
  try {
    final ids =
        (await controller.getLayerIds()).map((id) => id.toString()).toSet();
    if (ids.contains('building-3d') &&
        (ids.contains('smarttaxi-3d-buildings') ||
            ids.contains('smarttaxi-driver-3d-buildings'))) {
      // The pinned Android plugin's setLayerProperties does NOT dispatch
      // fill-extrusion layers. The dedicated visibility API supports them.
      await controller.setLayerVisibility('building-3d', false);
    }
  } catch (_) {
    // Retain the provider's buildings if the optional replacement is absent.
  }
}

/// Where a runtime layer has to be inserted so the style's own labels stay on
/// top of it.
///
/// MapLibre adds a runtime layer above every existing style layer unless it is
/// told otherwise, and the product rule is the other way round: 3D buildings
/// go under street, POI and city names, and only the map annotations
/// (pickup/dropoff/driver markers) sit above the houses.
///
/// Road-direction arrows are not a safe anchor: in Liberty they precede the
/// provider building layers, so a custom extrusion added there is covered by
/// the regular 2D buildings. `getLayerIds()` returns bottom-to-top order; the
/// first label-looking id is the lowest actual label layer and leaves every
/// street, POI and city name readable above our buildings.
///
/// Returns null when the style has no label layers at all, which means "add on
/// top" — MapLibre's own default, and the best available answer for a style
/// with nothing to stay readable above.
Future<String?> resolveLabelAnchorLayerId(
  native_map.MapLibreMapController controller,
) async {
  try {
    final ids = (await controller.getLayerIds())
        .map((id) => id.toString())
        .toList(growable: false);
    for (final id in ids) {
      final lower = id.toLowerCase();
      if (lower.contains('label') ||
          lower.contains('_name') ||
          lower.startsWith('poi_')) {
        return id;
      }
    }
  } catch (_) {
    // Style not ready yet, or a platform that does not implement the call.
    // Falling through to null keeps the map itself working either way.
  }
  return null;
}
