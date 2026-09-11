class AppConfig {
  // Bump on every release — compared against the backend's
  // APP_LATEST_VERSION/APP_MIN_SUPPORTED_VERSION by the update-check screen
  // (main.dart), and shown as-is in both shells' "О приложении"/Settings.
  static const appVersion = '1.0.0';
  static const apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'https://api.smarttaxi.kz',
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
  // Public web app used for the "поделиться поездкой" tracking link. Must be
  // www (not the bare apex) -- ps.kz's panel can't put a CNAME on the apex
  // record (it already carries the zone's NS/MX/TXT records), so the apex
  // has no working DNS entry at all; only the www subdomain resolves.
  static const webBaseUrl = String.fromEnvironment(
    'WEB_BASE_URL',
    defaultValue: 'https://www.smarttaxi.kz',
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
}
