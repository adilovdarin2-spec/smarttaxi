class AppConfig {
  static const apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://192.168.8.9:4000',
  );
  static const socketUrl = String.fromEnvironment(
    'SOCKET_URL',
    defaultValue: apiBaseUrl,
  );
  static const osmTileUrl = String.fromEnvironment(
    'OSM_TILE_URL',
    defaultValue: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  );
  static const mapAttribution = String.fromEnvironment(
    'MAP_ATTRIBUTION_TEXT',
    defaultValue: '© OpenStreetMap contributors',
  );
}
