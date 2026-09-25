import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

String _read(String path) => File(path).readAsStringSync();

void main() {
  // Raising the alarm used to require placing a phone call: the support
  // message only went out as a side effect of tapping "Позвонить". The row
  // underneath said support would be notified, and it was true — but only if
  // you called. A driver being robbed, or a rider frightened of the person
  // sitting next to them, needs a way to do this without putting a phone to
  // their ear and saying so out loud.
  const sheets = {
    'driver': 'lib/features/driver/widgets/driver_common_widgets.dart',
    'passenger': 'lib/features/passenger/passenger_shell.dart',
  };

  test('either side can raise the alarm without making a call', () {
    sheets.forEach((who, path) {
      final source = _read(path);
      expect(source, contains('Future<bool> _sendSosAlert() async {'),
          reason: '$who: the alarm has to report whether it got through');
      expect(source, contains('Future<void> _sendSilently('),
          reason: '$who: there must be a path that does not dial');
      expect(source, contains('title: l10n.sosSendSignalTitle'),
          reason: '$who: and it has to be a row the person can actually tap');
      expect(source, contains('unawaited(_sendSilently(messenger, sentText, failedText));'),
          reason: '$who: the silent row must send');
    });
  });

  test('the call stays first, and still carries the alarm with it', () {
    sheets.forEach((who, path) {
      final source = _read(path);
      final sheet = source.substring(source.indexOf('Future<bool> _sendSosAlert()'));
      final call = sheet.indexOf('unawaited(_callEmergency());');
      final silent = sheet.indexOf('unawaited(_sendSilently(');
      expect(call, greaterThan(-1), reason: '$who: the call must still exist');
      expect(call, lessThan(silent),
          reason: '$who: calling is the better answer and stays the first row');
      expect(sheet.substring(call, call + 200),
          contains('unawaited(_sendSosAlert());'),
          reason: '$who: the call must still take the alarm with it');
    });
  });

  test('the result is read before the sheet closes, not after', () {
    // ScaffoldMessenger.maybeOf on a popped route's context finds nothing, so
    // the alarm would succeed and say nothing at all.
    sheets.forEach((who, path) {
      final source = _read(path);
      final row = source.substring(source.indexOf('title: l10n.sosSendSignalTitle'));
      final messenger = row.indexOf('ScaffoldMessenger.maybeOf(context)');
      final pop = row.indexOf('Navigator.pop(context);');
      expect(messenger, greaterThan(-1), reason: who);
      expect(messenger, lessThan(pop),
          reason: '$who: read the messenger before closing the sheet');
    });
  });

  test('every language has the words for it', () {
    for (final code in ['ru', 'kk', 'uz', 'zh']) {
      final arb =
          jsonDecode(_read('lib/l10n/app_$code.arb')) as Map<String, Object?>;
      for (final key in [
        'sosSendSignalTitle',
        'sosSendSignalText',
        'sosSignalSentToast',
        'sosSignalFailedToast',
      ]) {
        expect(arb[key], isA<String>(), reason: '$key missing from app_$code');
        expect((arb[key]! as String).trim(), isNotEmpty);
      }
      // "Sent" and "could not send" must not read the same, or the one thing
      // the person needs to know is the one thing they cannot tell.
      expect(arb['sosSignalSentToast'], isNot(arb['sosSignalFailedToast']),
          reason: 'app_$code cannot tell success from failure');
    }
  });
}
