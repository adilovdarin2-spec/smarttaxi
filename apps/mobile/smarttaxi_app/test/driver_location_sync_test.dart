import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:smarttaxi_app/features/driver/models/driver_location_sync.dart';

Future<void> flush() => Future<void>.delayed(Duration.zero);

void main() {
  test('routing waits for GPS persistence instead of racing the write',
      () async {
    final write = Completer<int>();
    final routes = <int>[];
    final sync = DriverLocationSync<int, int>(
      publish: (_) => write.future,
      onPublished: (position, _) => routes.add(position),
      onError: (error) => fail('$error'),
      isCurrent: () => true,
    );
    final accepted = sync.add(1);
    await flush();
    expect(routes, isEmpty);
    write.complete(10);
    expect(await accepted, isTrue);
    expect(routes, [1]);
    sync.dispose();
  });

  test(
      'slow writes are serial and the newest waiting GPS fix replaces older ones',
      () async {
    final first = Completer<int>();
    final second = Completer<int>();
    final writes = <int>[];
    final routes = <int>[];
    final sync = DriverLocationSync<int, int>(
      publish: (position) {
        writes.add(position);
        return writes.length == 1 ? first.future : second.future;
      },
      onPublished: (position, _) => routes.add(position),
      onError: (error) => fail('$error'),
      isCurrent: () => true,
    );
    final initial = sync.add(1);
    final seed = sync.add(2);
    final latest = sync.add(3);
    expect(writes, [1]);
    first.complete(10);
    expect(await initial, isTrue);
    expect(writes, [1, 3]);
    expect(routes, [1]);
    second.complete(30);
    expect(await seed, isTrue,
        reason: 'A coalesced seed waits for an actual newer acknowledgement');
    expect(await latest, isTrue);
    expect(routes, [1, 3]);
    sync.dispose();
  });

  test(
      'a rejected location never refreshes a route and does not block a newer fix',
      () async {
    final first = Completer<int>();
    final errors = <Object>[];
    final routes = <int>[];
    final sync = DriverLocationSync<int, int>(
      publish: (position) =>
          position == 1 ? first.future : Future.value(position),
      onPublished: (position, _) => routes.add(position),
      onError: errors.add,
      isCurrent: () => true,
    );
    final rejected = sync.add(1);
    final next = sync.add(2);
    final failure = StateError('DRIVER_LOCATION_OUTSIDE_REGION');
    first.completeError(failure);
    expect(await rejected, isFalse);
    expect(await next, isTrue);
    expect(errors, [failure]);
    expect(routes, [2]);
    sync.dispose();
  });

  test('stopped location flow discards queued GPS and ignores a late response',
      () async {
    final write = Completer<int>();
    final routes = <int>[];
    final writes = <int>[];
    final sync = DriverLocationSync<int, int>(
      publish: (position) {
        writes.add(position);
        return write.future;
      },
      onPublished: (position, _) => routes.add(position),
      onError: (error) => fail('$error'),
      isCurrent: () => true,
    );
    final active = sync.add(1);
    final queued = sync.add(2);
    sync.dispose();
    expect(await queued, isFalse);
    expect(await sync.add(3), isFalse);
    write.complete(10);
    expect(await active, isFalse);
    expect(writes, [1]);
    expect(routes, isEmpty);
  });

  test(
      'a replaced shell or flow cannot publish pending fixes or apply responses',
      () async {
    var current = true;
    final write = Completer<int>();
    final routes = <int>[];
    final writes = <int>[];
    final sync = DriverLocationSync<int, int>(
      publish: (position) {
        writes.add(position);
        return write.future;
      },
      onPublished: (position, _) => routes.add(position),
      onError: (error) => fail('$error'),
      isCurrent: () => current,
    );
    final active = sync.add(1);
    final queued = sync.add(2);
    current = false;
    write.complete(10);
    expect(await active, isFalse);
    expect(await queued, isFalse);
    expect(writes, [1]);
    expect(routes, isEmpty);
  });

  test('normal movement retains a finite trailing refresh deadline', () {
    for (final elapsed in [1, 3, 8, 11, 12]) {
      final delay = driverRouteRefreshDelay(
          elapsed: Duration(seconds: elapsed),
          phaseChanged: false,
          offRoute: false);
      expect(Duration(seconds: elapsed) + delay, const Duration(seconds: 12));
    }
  });

  test('deviation retains the 4 second floor without losing the final fix', () {
    expect(
        driverRouteRefreshDelay(
            elapsed: const Duration(seconds: 1),
            phaseChanged: false,
            offRoute: true),
        const Duration(seconds: 3));
    expect(
        driverRouteRefreshDelay(
            elapsed: const Duration(seconds: 4),
            phaseChanged: false,
            offRoute: true),
        Duration.zero);
  });

  test('initial, changed-leg and overdue routes preserve their refresh rules',
      () {
    expect(
        driverRouteRefreshDelay(
            elapsed: null, phaseChanged: true, offRoute: false),
        Duration.zero);
    expect(
        driverRouteRefreshDelay(
            elapsed: const Duration(seconds: 1),
            phaseChanged: true,
            offRoute: false),
        const Duration(seconds: 3));
    expect(
        driverRouteRefreshDelay(
            elapsed: const Duration(seconds: 13),
            phaseChanged: false,
            offRoute: false),
        Duration.zero);
  });
}
