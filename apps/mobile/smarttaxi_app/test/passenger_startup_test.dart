import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:smarttaxi_app/core/utils/passenger_startup.dart';

void main() {
  for (final restored in [false, true]) {
    test('Location waits for slow order restoration, restored=$restored',
        () async {
      final restoration = Completer<void>();
      var hasOrder = false;
      var settled = false;
      final result = mayLocatePassenger(
        orderRestoration: restoration.future,
        isMounted: () => true,
        hasOrder: () => hasOrder,
      ).then((allowed) {
        settled = true;
        return allowed;
      });
      await Future<void>.delayed(Duration.zero);
      expect(settled, isFalse);
      hasOrder = restored;
      restoration.complete();
      expect(await result, !restored);
    });
  }
  test('Disposed passenger cannot start location after restoration', () async {
    final restoration = Completer<void>();
    var mounted = true;
    final result = mayLocatePassenger(
      orderRestoration: restoration.future,
      isMounted: () => mounted,
      hasOrder: () => false,
    );
    mounted = false;
    restoration.complete();
    expect(await result, isFalse);
  });

  test('first detection asks once when several regions are available', () {
    expect(
      shouldConfirmDetectedRegion(
        activeRegionCount: 13,
        detectedRegionId: 'myrzakent',
      ),
      isTrue,
    );
  });

  test('the same confirmed region does not ask again after a cold launch', () {
    expect(
      shouldConfirmDetectedRegion(
        activeRegionCount: 13,
        detectedRegionId: 'myrzakent',
        confirmedRegionId: 'myrzakent',
      ),
      isFalse,
    );
  });

  test('moving to a different region requires a new confirmation', () {
    expect(
      shouldConfirmDetectedRegion(
        activeRegionCount: 13,
        detectedRegionId: 'shymkent',
        confirmedRegionId: 'myrzakent',
      ),
      isTrue,
    );
  });

  test('a single active region needs no redundant confirmation', () {
    expect(
      shouldConfirmDetectedRegion(
        activeRegionCount: 1,
        detectedRegionId: 'myrzakent',
      ),
      isFalse,
    );
  });
}
