import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:smarttaxi_app/core/config/app_config.dart';
import 'package:smarttaxi_app/core/map/map_style.dart';

String _read(String path) => File(path).readAsStringSync();

void main() {
  test('a stored choice survives a rename of the enum constant', () {
    for (final style in MapStyleChoice.available) {
      expect(MapStyleChoice.fromStorage(style.storageValue), style);
    }
    expect(MapStyleChoice.fromStorage(null), MapStyleChoice.fallback);
    expect(MapStyleChoice.fromStorage('nonsense'), MapStyleChoice.fallback);
    // The stored spellings are part of the contract with every installed
    // phone: changing one silently resets that phone to the default.
    expect(
      MapStyleChoice.values.map((style) => style.storageValue).toList(),
      ['3d', '2d', 'satellite'],
    );
  });

  test('a phone that remembers imagery is not left on an empty layer', () {
    // Снимки выключены, пока в сборку не передан оплаченный источник: у
    // бесплатных провайдеров условия этого не разрешают. Телефон, на котором
    // человек когда-то выбрал снимки, должен вернуться к рисованной карте, а
    // не к серому полю.
    expect(AppConfig.satelliteEnabled, isFalse);
    expect(MapStyleChoice.available, isNot(contains(MapStyleChoice.satellite)));
    expect(MapStyleChoice.fromStorage('satellite'), MapStyleChoice.fallback);
  });

  test('each style answers a different question', () {
    // Volume is the whole point of one of them and of none of the others.
    expect(MapStyleChoice.threeD.extrudesBuildings, isTrue);
    expect(MapStyleChoice.twoD.extrudesBuildings, isFalse);
    expect(MapStyleChoice.satellite.extrudesBuildings, isFalse);

    // Tilting a plan or a photograph smears it and tells nobody anything.
    expect(MapStyleChoice.threeD.isTilted, isTrue);
    expect(MapStyleChoice.twoD.isTilted, isFalse);
    expect(MapStyleChoice.satellite.isTilted, isFalse);

    // Our footprints would cover the roofs the rider switched to imagery for.
    expect(MapStyleChoice.satellite.drawsBuildings, isFalse);
    expect(MapStyleChoice.twoD.drawsBuildings, isTrue);

    // The drawn styles share one basemap; only the imagery one replaces it.
    expect(MapStyleChoice.threeD.styleString, AppConfig.mapLibreStyleUrl);
    expect(MapStyleChoice.twoD.styleString, AppConfig.mapLibreStyleUrl);
    expect(MapStyleChoice.satellite.styleString,
        isNot(AppConfig.mapLibreStyleUrl));
  });

  test('the satellite style is a document MapLibre will accept', () {
    // The Android bridge decides between a URL and an inline document by the
    // first character, so this has to stay parseable JSON starting with "{".
    expect(MapStyleChoice.satellite.styleString.startsWith('{'), isTrue);
    final style = jsonDecode(MapStyleChoice.satellite.styleString)
        as Map<String, Object?>;
    expect(style['version'], 8);
    expect(style['glyphs'], isNotNull,
        reason: 'labels without a glyph source render as nothing at all');

    final sources = style['sources']! as Map<String, Object?>;
    final imagery = sources['satellite']! as Map<String, Object?>;
    expect(imagery['type'], 'raster');
    expect((imagery['tiles']! as List).single, AppConfig.satelliteTileUrl);
    expect(imagery['attribution'], isNotEmpty,
        reason: 'the imagery provider has to be credited on the map');
    // Measured, not assumed: this provider answers z18 over every active
    // region with a grey "Map data not yet available" tile. Declaring the
    // real maximum makes MapLibre stretch the deepest real image instead.
    expect(imagery['maxzoom'], AppConfig.satelliteMaxZoom);
    expect(AppConfig.satelliteMaxZoom, lessThanOrEqualTo(17));

    final layers = (style['layers']! as List).cast<Map<String, Object?>>();
    expect(layers.first['type'], 'raster',
        reason: 'the photograph goes underneath everything else');
    final ids = layers.map((layer) => layer['id']).toList();
    expect(ids, contains('satellite-road-label'));
    expect(ids, contains('satellite-place-label'));

    // The route and the app's own pins are inserted below the lowest layer
    // whose id looks like a label (resolveLabelAnchorLayerId). Imagery mode
    // needs at least one, or the route is drawn over the street names.
    expect(
      ids.any((id) => id.toString().contains('label')),
      isTrue,
      reason: 'the route anchors itself below the first label layer',
    );

    // Bare imagery cannot answer "which street is this", which is most of
    // what anyone opens a taxi map for.
    for (final layer in layers.where((l) => l['type'] == 'symbol')) {
      final paint = layer['paint']! as Map<String, Object?>;
      expect(paint['text-color'], '#ffffff');
      expect(paint['text-halo-width'], greaterThan(1),
          reason: 'white text needs a halo to survive a bright roof');
    }
  });

  test('a photograph is never put through the theme tile filter', () {
    expect(MapStyleChoice.satellite.allowsTileTinting, isFalse);
    expect(MapStyleChoice.threeD.allowsTileTinting, isTrue);
    expect(MapStyleChoice.twoD.allowsTileTinting, isTrue);
    expect(identityTileMatrix.length, 20);
    expect(identityTileMatrix, [
      1, 0, 0, 0, 0, //
      0, 1, 0, 0, 0, //
      0, 0, 1, 0, 0, //
      0, 0, 0, 1, 0, //
    ]);

    // Only the imagery choice reaches the raster surfaces, which are flat by
    // construction and so have nothing to say about volume.
    expect(MapStyleChoice.satellite.rasterTileUrl, AppConfig.satelliteTileUrl);
    expect(MapStyleChoice.threeD.rasterTileUrl, AppConfig.osmTileUrl);
    expect(MapStyleChoice.twoD.rasterTileUrl, AppConfig.osmTileUrl);
  });

  test('both apps offer the choice and remember it per device', () {
    final passenger = _read('lib/features/passenger/passenger_shell.dart');
    final driver = _read('lib/features/driver/driver_shell.dart');
    final store = _read('lib/core/auth/auth_store.dart');
    final main = _read('lib/main.dart');

    for (final source in [passenger, driver]) {
      expect(source, contains('showMapStylePicker(context'));
      expect(source, contains('mapStyleIcon(widget.mapStyle)'));
      expect(source, contains('styleString: widget.style.styleString'));
    }

    // A device preference like the theme and the language: it describes this
    // phone, not the account, so logging out must not clear it.
    expect(store, contains("_mapStyleKey = 'smarttaxi.app.mapStyle'"));
    final clearBody = store.substring(store.indexOf('Future<void> clear('));
    expect(clearBody.contains('_mapStyleKey'), isFalse,
        reason: 'signing out must not reset how the map is drawn');

    expect(main, contains('unawaited(_loadMapStyle())'));
    expect(main, contains('widget.authStore.saveMapStyle(style.storageValue)'));
    // Both roles are handed the same preference, or a driver who is also a
    // rider gets two different maps out of one setting.
    expect('mapStyle: _mapStyle,'.allMatches(main).length, 2);
  });

  test('no map in either app is left drawn when the rider chose imagery', () {
    // A screen that ignores the choice is worse than not offering it: the
    // rider switches to a photograph and half the app is still a drawing.
    // The passenger stands map was exactly that until it was found on a
    // device.
    final surfaces = Directory('lib')
        .listSync(recursive: true)
        .whereType<File>()
        .where((file) => file.path.endsWith('.dart'))
        .map((file) => MapEntry(file.path, file.readAsStringSync()))
        .where((entry) => entry.value.contains('urlTemplate:'));
    expect(surfaces, isNotEmpty, reason: 'the raster surfaces must still exist');
    for (final entry in surfaces) {
      expect(
        entry.value,
        contains('urlTemplate: widget.mapStyle.rasterTileUrl'),
        reason: '${entry.key} draws tiles without honouring the chosen style',
      );
    }
  });

  test('every choice is named in every language the app ships', () {
    for (final code in ['ru', 'kk', 'uz', 'zh']) {
      final arb =
          jsonDecode(_read('lib/l10n/app_$code.arb')) as Map<String, Object?>;
      for (final key in [
        'mapStyleTitle',
        'mapStyleButtonTooltip',
        'mapStyle3d',
        'mapStyle3dDescription',
        'mapStyle2d',
        'mapStyle2dDescription',
        'mapStyleSatellite',
        'mapStyleSatelliteDescription',
      ]) {
        expect(arb[key], isA<String>(),
            reason: '$key is missing from app_$code.arb');
        expect((arb[key]! as String).trim(), isNotEmpty);
      }
    }
  });
}
