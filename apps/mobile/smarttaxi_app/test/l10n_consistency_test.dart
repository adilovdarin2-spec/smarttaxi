import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

const _languages = ['ru', 'kk', 'uz', 'zh'];

Map<String, String> _strings(String code) {
  final raw = jsonDecode(
      File('lib/l10n/app_$code.arb').readAsStringSync()) as Map<String, Object?>;
  return {
    for (final entry in raw.entries)
      if (!entry.key.startsWith('@') && entry.value is String)
        entry.key: entry.value! as String,
  };
}

void main() {
  test('every language says everything the app asks for', () {
    final russian = _strings('ru');
    for (final code in _languages.where((code) => code != 'ru')) {
      final other = _strings(code);
      final missing = russian.keys.where((key) => !other.containsKey(key));
      expect(missing, isEmpty, reason: 'app_$code.arb is missing: $missing');
      final blank = other.entries
          .where((entry) => entry.value.trim().isEmpty)
          .map((entry) => entry.key);
      expect(blank, isEmpty, reason: 'app_$code.arb has empty: $blank');
    }
  });

  test('a caption never repeats the label it sits under', () {
    // The price stepper shows its own title and, under it in smaller grey
    // type, what that price currently is — the recommended one, or the
    // rider's own. In Kazakh and Chinese both lines read the same words, so
    // the caption said nothing at all. Same shape, same risk, wherever a
    // label and its caption are two separate keys.
    const pairs = [
      ('passengerYourPriceLabel', 'passengerPriceYourBid'),
      ('passengerYourPriceLabel', 'passengerPriceRecommended'),
      ('driverUnsettledTripTitle', 'driverUnsettledTripMessage'),
      ('passengerNamePointTitle', 'passengerNamePointSubtitle'),
    ];
    for (final code in _languages) {
      final strings = _strings(code);
      for (final (label, caption) in pairs) {
        expect(strings[label], isNotNull, reason: '$label missing in $code');
        expect(strings[caption], isNotNull, reason: '$caption missing in $code');
        expect(
          strings[caption]!.trim().toLowerCase(),
          isNot(strings[label]!.trim().toLowerCase()),
          reason: 'in app_$code.arb, $caption repeats $label word for word',
        );
      }
    }
  });
}
