import 'dart:convert';

import '../config/app_config.dart';
import '../utils/map_layers.dart';

/// What the map is drawn as. A device preference, like the theme and the
/// interface language: the rider and the driver pick it once and it holds.
///
/// Three, because they answer three different questions. Volume ([threeD])
/// tells you which building is which when you are standing in front of it.
/// The plan ([twoD]) is faster to read at a glance and cheaper to draw on an
/// old phone. Imagery ([satellite]) is what people fall back on when the map
/// disagrees with what they can see — a yard, a shed, a gate the map has
/// never heard of.
enum MapStyleChoice {
  threeD,
  twoD,
  satellite;

  /// The value written to storage. Fixed strings rather than [name], so
  /// renaming an enum constant cannot silently reset every installed phone to
  /// the default.
  String get storageValue => switch (this) {
        MapStyleChoice.threeD => '3d',
        MapStyleChoice.twoD => '2d',
        MapStyleChoice.satellite => 'satellite',
      };

  static const fallback = MapStyleChoice.threeD;

  static MapStyleChoice fromStorage(String? value) {
    for (final choice in MapStyleChoice.values) {
      if (choice.storageValue == value) return choice;
    }
    return fallback;
  }

  /// Vector styles keep the app's own building work; imagery does not — the
  /// roofs are already in the picture.
  bool get drawsBuildings => this != MapStyleChoice.satellite;

  /// Only one of the three is a perspective view. Tilting a plan or a
  /// photograph smears it without telling anyone anything.
  bool get isTilted => this == MapStyleChoice.threeD;

  /// Buildings get real volume in exactly one style.
  bool get extrudesBuildings => this == MapStyleChoice.threeD;

  /// What [native_map.MapLibreMap.styleString] is given. Changing this on a
  /// live map reloads the style, which both map surfaces already handle: they
  /// rebuild every runtime layer from `onStyleLoadedCallback`.
  String get styleString => switch (this) {
        MapStyleChoice.threeD ||
        MapStyleChoice.twoD =>
          AppConfig.mapLibreStyleUrl,
        MapStyleChoice.satellite => satelliteStyleJson,
      };

  /// Raster tiles for the surfaces that are not MapLibre — the driver's
  /// full-screen navigator and the legacy compatibility map. Those are flat
  /// by construction, so they can only honour the imagery choice.
  String get rasterTileUrl => this == MapStyleChoice.satellite
      ? AppConfig.satelliteTileUrl
      : AppConfig.osmTileUrl;

  /// Raster surfaces tint their tiles to match the app's light/dark theme.
  /// A photograph must never be put through that filter: it is a picture of
  /// the world, not a drawing whose palette we own.
  bool get allowsTileTinting => this != MapStyleChoice.satellite;

  String get attribution => this == MapStyleChoice.satellite
      ? AppConfig.satelliteAttribution
      : AppConfig.mapAttribution;
}

/// Leaves a raster tile exactly as the provider sent it.
///
/// The light and dark tile matrices exist to match a drawn map to the app's
/// theme. Satellite imagery is a photograph of the world, not a drawing whose
/// palette is ours to change, and putting it through either one turns it into
/// a washed blue or a muddy negative.
const List<double> identityTileMatrix = <double>[
  1, 0, 0, 0, 0, //
  0, 1, 0, 0, 0, //
  0, 0, 1, 0, 0, //
  0, 0, 0, 1, 0, //
];

/// A hybrid imagery style: the photograph underneath, and street and
/// settlement names from the same vector tiles the drawn map uses.
///
/// Built here rather than fetched, for two reasons. There is no keyless
/// hosted satellite style to point at, and the labels are the whole point —
/// bare imagery cannot answer "which street is this", which is most of what
/// anyone opens a taxi map for.
final String satelliteStyleJson = jsonEncode(<String, Object?>{
  'version': 8,
  'name': 'BaiSapar Satellite',
  'glyphs': AppConfig.mapGlyphsUrl,
  'sources': <String, Object?>{
    'satellite': <String, Object?>{
      'type': 'raster',
      'tiles': <String>[AppConfig.satelliteTileUrl],
      'tileSize': 256,
      // The provider has no imagery deeper than this over the service area:
      // asking for z18 returns a grey "Map data not yet available" tile.
      // Declaring the real maximum makes MapLibre stretch the last real tile
      // instead, which is softer but is still a photograph of the right
      // place.
      'maxzoom': AppConfig.satelliteMaxZoom,
      'attribution': AppConfig.satelliteAttribution,
    },
    'openmaptiles': <String, Object?>{
      'type': 'vector',
      'url': AppConfig.vectorTileJsonUrl,
    },
  },
  'layers': <Object?>[
    <String, Object?>{
      'id': 'satellite-imagery',
      'type': 'raster',
      'source': 'satellite',
    },
    // Street names, on the two classes a driver actually turns into. White on
    // a dark halo is the only pairing that stays readable over both a bright
    // roof and a dark field.
    <String, Object?>{
      'id': 'satellite-road-label',
      'type': 'symbol',
      'source': 'openmaptiles',
      'source-layer': 'transportation_name',
      'minzoom': 13,
      'filter': <Object>[
        'match',
        <Object>['geometry-type'],
        <String>['LineString', 'MultiLineString'],
        true,
        false,
      ],
      'layout': <String, Object?>{
        'symbol-placement': 'line',
        'text-field': _roadLabelText,
        'text-font': <String>[AppConfig.mapLabelFont],
        'text-rotation-alignment': 'map',
        'text-size': <Object>[
          'interpolate',
          <Object>['linear'],
          <Object>['zoom'],
          13,
          11,
          17,
          13.5,
        ],
      },
      'paint': <String, Object?>{
        'text-color': '#ffffff',
        'text-halo-color': 'rgba(12, 25, 45, 0.85)',
        'text-halo-width': 1.5,
        'text-halo-blur': 0.4,
      },
    },
    <String, Object?>{
      'id': 'satellite-place-label',
      'type': 'symbol',
      'source': 'openmaptiles',
      'source-layer': 'place',
      'filter': <Object>[
        'match',
        <Object>['get', 'class'],
        <String>[
          'city',
          'town',
          'village',
          'hamlet',
          'suburb',
          'neighbourhood'
        ],
        true,
        false,
      ],
      'layout': <String, Object?>{
        // The same single local name the drawn map settled on: the provider's
        // Latin + non-Latin pair renders Atakent/Атакент as a visual
        // duplicate.
        'text-field': libertyPlaceLabelText,
        'text-font': <String>[AppConfig.mapLabelFont],
        'text-max-width': 8,
        'text-size': <Object>[
          'interpolate',
          <Object>['exponential', 1.2],
          <Object>['zoom'],
          7,
          12,
          13,
          16,
        ],
      },
      'paint': <String, Object?>{
        'text-color': '#ffffff',
        'text-halo-color': 'rgba(12, 25, 45, 0.85)',
        'text-halo-width': 1.7,
        'text-halo-blur': 0.5,
      },
    },
  ],
});

/// Street names come from the vector tiles in whichever spelling the source
/// carries; prefer the local one, the way the drawn map does.
const List<Object> _roadLabelText = <Object>[
  'coalesce',
  <Object>['get', 'name:nonlatin'],
  <Object>['get', 'name:latin'],
  <Object>['get', 'name_en'],
  <Object>['get', 'name'],
];
