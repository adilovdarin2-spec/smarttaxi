import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  final gradle = File('android/app/build.gradle.kts').readAsStringSync();
  final settings = File('android/settings.gradle.kts').readAsStringSync();
  final gradleProperties = File('android/gradle.properties').readAsStringSync();
  final gradleWrapper = File(
    'android/gradle/wrapper/gradle-wrapper.properties',
  ).readAsStringSync();
  final ci =
      File('../../../.github/workflows/basic-check.yml').readAsStringSync();

  test('Android release targets the current Google Play API level', () {
    expect(gradle, contains('targetSdk = 36'));
  });

  test('Android build stays on the verified AGP 9 compatibility set', () {
    expect(settings, contains('version "9.4.0" apply false'));
    expect(settings, contains('version "2.3.20" apply false'));
    expect(gradleWrapper, contains('gradle-9.6.0-all.zip'));

    // Flutter 3.47 still needs compatibility mode while published plugins such
    // as flutter_tts apply the legacy Kotlin Gradle Plugin. These flags must be
    // removed together only after every plugin has migrated to built-in Kotlin.
    expect(gradleProperties, contains('android.builtInKotlin=false'));
    expect(gradleProperties, contains('android.newDsl=false'));
    expect(gradle, contains('id("kotlin-android")'));
    expect(gradle, contains('JvmTarget.JVM_17'));
  });

  test('the app is published under one identity, spelled the same everywhere',
      () {
    // The application id is the app's identity on Google Play and can only be
    // chosen once — after the first publish it is a different app, with none
    // of the reviews, installs or updates of the old one. It is fixed here so
    // that a rename cannot happen by halves: the namespace, the id and the
    // Kotlin package have to agree, or the manifest's ".MainActivity" resolves
    // to a class that does not exist and the app dies at launch.
    const id = 'kz.onedriver.app';
    expect(gradle, contains('namespace = "$id"'));
    expect(gradle, contains('applicationId = "$id"'));
    expect(gradle, isNot(contains('kz.smarttaxi')));

    final packagePath = id.replaceAll('.', '/');
    final activity =
        File('android/app/src/main/kotlin/$packagePath/MainActivity.kt');
    expect(activity.existsSync(), isTrue,
        reason: 'MainActivity must live in the package it declares');
    expect(activity.readAsStringSync(), contains('package $id'));

    final manifest =
        File('android/app/src/main/AndroidManifest.xml').readAsStringSync();
    expect(manifest, contains('android:name=".MainActivity"'));

    for (final path in [
      'lib/features/passenger/passenger_shell.dart',
      'lib/features/passenger/screens/stands/passenger_stands_screen.dart',
      'lib/features/driver/driver_shell.dart',
    ]) {
      final source = File(path).readAsStringSync();
      expect(source, contains("userAgentPackageName: '$id'"),
          reason: '$path must identify OneDriver to map tile providers');
      expect(
          source, isNot(contains("userAgentPackageName: 'com.smarttaxi.app'")),
          reason: '$path must not send the retired package id');
    }
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

  test('clean CI debug builds do not require production Firebase material', () {
    expect(
      gradle,
      contains('id("com.google.gms.google-services") apply false'),
    );
    expect(
      gradle,
      contains('if (hasGoogleServicesConfig) {\n'
          '    apply(plugin = "com.google.gms.google-services")\n'
          '}'),
    );
    expect(
      gradle,
      contains(
        'throw GradleException("Release Firebase configuration is required. '
        'Add the owner-controlled android/app/google-services.json before '
        'building a release artifact.")',
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
