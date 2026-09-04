import 'package:maplibre_gl/maplibre_gl.dart' as native_map;

/// Where a runtime layer has to be inserted so the style's own labels stay on
/// top of it.
///
/// MapLibre adds a runtime layer above every existing style layer unless it is
/// told otherwise, and the product rule is the other way round: 3D buildings
/// go under street, POI and city names, and only the map annotations
/// (pickup/dropoff/driver markers) sit above the houses.
///
/// Both map screens got this wrong in different directions. The passenger map
/// hardcoded `road_one_way_arrow`, which is right for the deployed OpenFreeMap
/// Liberty style but throws on any style without that exact layer — and the
/// `catch` around the call swallowed it, so the map lost its buildings
/// entirely instead of drawing them a little differently. The driver map
/// passed no anchor at all, so its buildings covered the street names on the
/// navigation screen, which is the one place a name has to stay readable.
///
/// `road_one_way_arrow` stays the first choice so the deployed style keeps
/// exactly the layering it has been QA'd with. `getLayerIds()` returns style
/// order, bottom first, so the first label-looking id after that is the lowest
/// label layer — the same anchor `MapView.jsx` computes on the web.
///
/// Returns null when the style has no label layers at all, which means "add on
/// top" — MapLibre's own default, and the best available answer for a style
/// with nothing to stay readable above.
Future<String?> resolveLabelAnchorLayerId(
  native_map.MapLibreMapController controller,
) async {
  const preferred = 'road_one_way_arrow';
  try {
    final ids = (await controller.getLayerIds())
        .map((id) => id.toString())
        .toList(growable: false);
    if (ids.contains(preferred)) return preferred;
    for (final id in ids) {
      final lower = id.toLowerCase();
      if (lower.contains('label') || lower.contains('_name')) return id;
    }
  } catch (_) {
    // Style not ready yet, or a platform that does not implement the call.
    // Falling through to null keeps the map itself working either way.
  }
  return null;
}
