import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:smarttaxi_app/features/shared/models.dart';

String _read(String path) => File(path).readAsStringSync();

OrderSummary _order(String status) => OrderSummary(
      id: 'ride-1',
      status: status,
      pickup: 'улица Абая, 10',
      dropoff: 'Көк қақпа, мешіттің артында',
      driverId: 'driver-1',
    );

void main() {
  test('a finished trip is not finished until the fare is confirmed', () {
    // CLIENT_ACTIVE_ORDER_STATUSES counts both of these against the rider's
    // one-active-order limit, so a trip parked here is not a closed trip —
    // it is a rider who cannot order a taxi from anyone.
    for (final status in ['TRIP_COMPLETED', 'PAYMENT_PENDING']) {
      expect(_order(status).awaitsSettlement, isTrue, reason: status);
      expect(_order(status).isActive, isFalse,
          reason: '$status is not a trip the driver is still driving');
    }
    for (final status in ['PAID', 'RATED', 'TRIP_STARTED', 'NO_SHOW']) {
      expect(_order(status).awaitsSettlement, isFalse, reason: status);
    }
  });

  test('the driver keeps seeing an unconfirmed fare after dismissing it', () {
    final shell = _read('lib/features/driver/driver_shell.dart');

    // "Готово" clears the trip tab on purpose — the driver has left that
    // trip. Before this, that was the last the app ever said about it until
    // a cold start, while the rider stayed blocked the whole shift.
    expect(shell, contains('OrderSummary? get _unsettledTrip'));
    final getter = shell.substring(
      shell.indexOf('OrderSummary? get _unsettledTrip'),
      shell.indexOf('Future<void> _settleTripPayment('),
    );
    expect(getter, contains('order.awaitsSettlement'));
    // Derived from the loaded orders rather than a field, so it survives a
    // dismiss, a tab switch and a restart without any state of its own.
    expect(getter, contains('for (final order in _orders)'));
    // A live trip already owns the screen; two payment prompts at once is
    // worse than none.
    expect(getter, contains('if (_activeOrder != null) return null;'));
    // And only when the driver can actually clear it — the server refuses a
    // driver confirming a card payment, so promising them a button that 403s
    // would be worse than staying quiet.
    expect(getter, contains('_driverCanConfirmPayment(order)'));
    final policy = shell.substring(shell.indexOf('bool _driverCanConfirmPayment('));
    expect(policy.substring(0, 400), contains("{'CASH', 'KASPI'}"));

    // It has to be on the screen the driver actually works from, in both
    // layouts — the MapLibre one and the legacy list.
    expect('unsettledTrip,'.allMatches(shell).length, 2);
    expect(shell, contains('final unsettledTrip = _unsettledTripCard();'));

    // And the button has to do the thing, then refresh what it changed.
    // The amount comes from formatDriverMoney, which already carries the ₸ —
    // appending another one printed "700 ₸ ₸" on a device.
    expect(shell, contains('formatDriverMoney((order.price ?? 0).round())),'));
    expect(shell.contains(r"formatDriverMoney((order.price ?? 0).round())} ₸'"),
        isFalse);

    final action = shell.substring(
      shell.indexOf('Future<void> _settleTripPayment('),
      shell.indexOf('Widget? _unsettledTripCard()'),
    );
    expect(action, contains('widget.api.markOrderPaid(order.id)'));
    expect(action, contains('await _loadOrders();'));
  });

  test('the prompt says what is actually at stake, in every language', () {
    for (final code in ['ru', 'kk', 'uz', 'zh']) {
      final arb =
          jsonDecode(_read('lib/l10n/app_$code.arb')) as Map<String, Object?>;
      for (final key in [
        'driverUnsettledTripTitle',
        'driverUnsettledTripMessage',
        'driverConfirmPaymentHint',
      ]) {
        expect(arb[key], isA<String>(), reason: '$key missing from app_$code');
        expect((arb[key]! as String).trim(), isNotEmpty);
      }
      expect((arb['driverUnsettledTripMessage']! as String), contains('{amount}'),
          reason: 'the driver is owed a number, not a vague reminder');
    }
  });
}
