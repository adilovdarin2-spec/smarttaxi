import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  final gradle = File('android/app/build.gradle.kts').readAsStringSync();
  final ci =
      File('../../../.github/workflows/basic-check.yml').readAsStringSync();

  test('Android release targets the current Google Play API level', () {
    expect(gradle, contains('targetSdk = 36'));
  });

  test('Android release remains fail-closed without owner signing material',
      () {
    expect(
      gradle,
      contains(
        'throw GradleException("Release signing is required. '
        'Create android/key.properties from key.properties.example and point '
        'it to a private upload keystore.")',
      ),
    );
    expect(
      gradle,
      contains(
        'signingConfig = if (hasReleaseKeystore) '
        'signingConfigs.getByName("release") else null',
      ),
    );
  });

  test('release traffic is encrypted while USB debug can use ADB reverse', () {
    expect(
      gradle,
      contains('manifestPlaceholders["cleartextTraffic"] = "false"'),
    );
    expect(
      gradle,
      contains('manifestPlaceholders["cleartextTraffic"] = "true"'),
    );
  });

  test('CI compiles an Android package instead of stopping at source tests',
      () {
    expect(ci, contains('flutter build apk --debug --no-pub'));
  });
}
