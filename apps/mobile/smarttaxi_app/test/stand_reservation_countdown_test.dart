import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

String _read(String path) => File(path).readAsStringSync();

void main() {
  // A held seat is not held forever: the server expires it after
  // RESERVATION_TTL_MINUTES and gives the seat back. The rider is standing at
  // the stand deciding whether to keep waiting or walk over to the car, and
  // "waiting for the driver" alone does not say whether that is two minutes
  // or twenty.
  test('the rider is told how long their seat is still held', () {
    final source = _read(
        'lib/features/passenger/screens/stands/passenger_stands_screen.dart');
    expect(source, contains('String _pendingText(AppLocalizations l10n) {'));
    expect(source, contains(': _pendingText(l10n),'),
        reason: 'the pending line has to use it');

    final helper = source.substring(
      source.indexOf('String _pendingText(AppLocalizations l10n) {'),
      source.indexOf('Widget build(BuildContext context) {',
          source.indexOf('String _pendingText(')),
    );
    // Rounded up: "0 мин" while the seat is still held would be a lie.
    expect(helper, contains('(left.inSeconds / 60).ceil()'));
    expect(helper, contains('l10n.standReservationPendingLastMinute'));
    // An expired or unknown deadline falls back to the plain wording rather
    // than counting into the negatives.
    expect(helper, contains('if (expiresAt == null) return l10n.standReservationPending;'));
    expect(helper, contains('if (left.isNegative) return l10n.standReservationPending;'));
  });

  test('the countdown rides the poll the screen already does', () {
    // No Ticker, no second timer: this screen reloads every 20 seconds and
    // rebuilds, which is accurate enough for a number in minutes and cannot
    // leak.
    final source = _read(
        'lib/features/passenger/screens/stands/passenger_stands_screen.dart');
    expect(source, contains('static const _refreshInterval = Duration(seconds: 20);'));
    expect(source.contains('AnimationController'), isFalse);
    expect(source.contains('SingleTickerProvider'), isFalse);
  });

  test('every language can say how many minutes are left', () {
    for (final code in ['ru', 'kk', 'uz', 'zh']) {
      final arb =
          jsonDecode(_read('lib/l10n/app_$code.arb')) as Map<String, Object?>;
      for (final key in [
        'standReservationPending',
        'standReservationPendingMinutes',
        'standReservationPendingLastMinute',
      ]) {
        expect(arb[key], isA<String>(), reason: '$key missing from app_$code');
        expect((arb[key]! as String).trim(), isNotEmpty);
      }
      expect(arb['standReservationPendingMinutes'], contains('{minutes}'),
          reason: 'app_$code must actually carry the number');
    }
  });
}
