import 'package:flutter_test/flutter_test.dart';
import 'package:smarttaxi_app/core/config/app_config.dart';

void main() {
  test('map configuration is explicit and attributed', () {
    expect(AppConfig.osmTileUrl, contains('{z}'));
    expect(AppConfig.osmTileUrl, contains('{x}'));
    expect(AppConfig.osmTileUrl, contains('{y}'));
    expect(AppConfig.mapAttribution, contains('OpenStreetMap'));
  });
}
