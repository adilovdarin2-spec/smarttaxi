class AppConfig {
  // Bump on every release — compared against the backend's
  // APP_LATEST_VERSION/APP_MIN_SUPPORTED_VERSION by the update-check screen
  // (main.dart), and shown as-is in both shells' "О приложении"/Settings.
  static const appVersion = '1.0.0';
  static const apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'https://smarttaxi-api-production.up.railway.app',
  );
  static const socketUrl = String.fromEnvironment(
    'SOCKET_URL',
    defaultValue: apiBaseUrl,
  );
  // Public web app used for the "поделиться поездкой" tracking link.
  static const webBaseUrl = String.fromEnvironment(
    'WEB_BASE_URL',
    defaultValue: 'https://smarttaxi.kz',
  );
  // Crash/error monitoring (Sentry). Empty disables reporting entirely —
  // see main.dart's SentryFlutter.init call.
  static const sentryDsn = String.fromEnvironment('SENTRY_DSN');
  // CARTO's Voyager basemap instead of raw tile.openstreetmap.org: it serves
  // real @2x tiles via the {r} placeholder (see the TileLayer retinaMode:
  // true call sites), so the map actually looks sharp on modern high-DPI
  // phone screens instead of upscaled/blurry 256px OSM tiles. Also avoids
  // hotlinking OSM's own tile server, which its usage policy asks apps not
  // to do.
  static const osmTileUrl = String.fromEnvironment(
    'OSM_TILE_URL',
    defaultValue:
        'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
  );

  static const osmFallbackTileUrl = String.fromEnvironment(
    'OSM_FALLBACK_TILE_URL',
    defaultValue: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  );
  static const mapAttribution = String.fromEnvironment(
    'MAP_ATTRIBUTION_TEXT',
    defaultValue: '© OpenStreetMap contributors © CARTO',
  );
}
