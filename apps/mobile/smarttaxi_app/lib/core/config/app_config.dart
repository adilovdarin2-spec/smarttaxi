class AppConfig {
  // Bump on every release — compared against the backend's
  // APP_LATEST_VERSION/APP_MIN_SUPPORTED_VERSION by the update-check screen
  // (main.dart), and shown as-is in both shells' "О приложении"/Settings.
  static const appVersion = '1.0.0';
  // The public backend. This is the service's own hosting address until
  // baisapar.kz is registered and pointed at it; a build that names no
  // API_BASE_URL must still reach a server that exists, because the previous
  // default was a domain that had stopped resolving and every such build
  // came up unable to load a single region.
  static const apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'https://smarttaxi-api-production-c518.up.railway.app',
  );
  static const socketUrl = String.fromEnvironment(
    'SOCKET_URL',
    defaultValue: apiBaseUrl,
  );
  // A checkout must never silently lead a passenger into the development
  // payment provider. This remains off until the production merchant
  // credentials and webhook are verified; enable it only in an explicit
  // release build with --dart-define=CARD_PAYMENTS_ENABLED=true.
  static const cardPaymentsEnabled = bool.fromEnvironment(
    'CARD_PAYMENTS_ENABLED',
    defaultValue: false,
  );
  // Public web app used for the "поделиться поездкой" tracking link — the
  // person receiving it opens this in a browser, so it has to be a public
  // address rather than the machine the build was made on.
  static const webBaseUrl = String.fromEnvironment(
    'WEB_BASE_URL',
    defaultValue: 'https://smarttaxi-web-production.up.railway.app',
  );
  // Crash/error monitoring (Sentry). Empty disables reporting entirely —
  // see main.dart's SentryFlutter.init call.
  static const sentryDsn = String.fromEnvironment('SENTRY_DSN');
  // MapTiler Streets is the production basemap. Keep the API key restricted
  // to this app's Android package in the MapTiler dashboard: keys embedded in
  // mobile builds are necessarily visible to clients.
  static const osmTileUrl = String.fromEnvironment(
    'OSM_TILE_URL',
    defaultValue: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  );

  static const osmFallbackTileUrl = String.fromEnvironment(
    'OSM_FALLBACK_TILE_URL',
    defaultValue: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  );
  // Native vector map is the default passenger experience. A build can still
  // explicitly set USE_MAPLIBRE_3D=false for compatibility investigation on
  // a particular legacy device; address and routing logic is shared.
  static const useMapLibre3d = bool.fromEnvironment(
    'USE_MAPLIBRE_3D',
    defaultValue: true,
  );
  static const mapLibreStyleUrl = String.fromEnvironment(
    'MAPLIBRE_STYLE_URL',
    defaultValue: 'https://tiles.openfreemap.org/styles/liberty',
  );

  static const mapAttribution = String.fromEnvironment(
    'MAP_ATTRIBUTION_TEXT',
    defaultValue: '© OpenFreeMap © OpenStreetMap contributors',
  );

  // --- Satellite ------------------------------------------------------
  // Слой снимков рядом с рисованной картой. Пусто — значит выключен, и в
  // выборе стиля его нет.
  //
  // Выключен не потому, что плохо работал. Esri World Imagery над этими
  // районами показывает дворы, крыши и калитки — ровно то, ради чего человек
  // и открывает снимок. Но его условия не разрешают такое использование, и
  // бесплатной замены нет: у MapTiler бесплатный тариф прямо назван
  // некоммерческим, у Mapbox отдельная оговорка про приложения, связанные с
  // транспортом, — такси требует отдельной коммерческой лицензии. Открытые и
  // бесплатные Sentinel-2 и Landsat дают 10–30 метров на пиксель: поле и сетку
  // улиц видно, двор — нет.
  //
  // Включать обратно — только вместе с оплаченной лицензией: адрес провайдера
  // в SATELLITE_TILE_URL и его подпись в SATELLITE_ATTRIBUTION_TEXT.
  static const satelliteTileUrl = String.fromEnvironment(
    'SATELLITE_TILE_URL',
    defaultValue: '',
  );

  /// Есть ли что показывать в режиме снимков.
  static bool get satelliteEnabled => satelliteTileUrl.trim().isNotEmpty;

  // Measured against every active region, not assumed: this provider answers
  // z18 and deeper with a grey "Map data not yet available" tile. Declaring
  // the real maximum makes the renderer stretch the deepest real image
  // instead of showing that placeholder to a rider looking for their gate.
  static const satelliteMaxZoom = int.fromEnvironment(
    'SATELLITE_MAX_ZOOM',
    defaultValue: 17,
  );

  static const satelliteAttribution = String.fromEnvironment(
    'SATELLITE_ATTRIBUTION_TEXT',
    defaultValue: 'Esri, Maxar, Earthstar Geographics © OpenStreetMap',
  );

  // Fonts and vector tiles for the hand-built satellite style. They are the
  // same ones the drawn basemap already loads, so imagery mode adds no new
  // host to the app's network surface.
  static const mapGlyphsUrl = String.fromEnvironment(
    'MAP_GLYPHS_URL',
    defaultValue: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
  );

  static const vectorTileJsonUrl = String.fromEnvironment(
    'VECTOR_TILEJSON_URL',
    defaultValue: 'https://tiles.openfreemap.org/planet',
  );

  static const mapLabelFont = String.fromEnvironment(
    'MAP_LABEL_FONT',
    defaultValue: 'Noto Sans Regular',
  );
}
