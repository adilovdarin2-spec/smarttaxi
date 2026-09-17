import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

String _read(String relative) =>
    File('lib/$relative').readAsStringSync().replaceAll(RegExp(r'\s+'), '');

void main() {
  test('native building shadows use a literal two-number translate', () {
    for (final file in [
      'features/passenger/passenger_shell.dart',
      'features/driver/driver_shell.dart',
    ]) {
      final source = _read(file);
      expect(source, contains("fillTranslate:['literal',[1.2,2]]"));
      expect(source, isNot(contains('fillTranslate:[1.2,2],')));
    }
  });
}
