import 'package:flutter_test/flutter_test.dart';
import 'package:smarttaxi_app/features/driver/driver_quick_message_policy.dart';

void main() {
  test('pickup quick messages never duplicate the arrival transition', () {
    for (final status in ['DRIVER_FOUND', 'DRIVER_GOING_TO_CLIENT']) {
      expect(
        driverQuickMessageKeysForStatus(status),
        {'ON_MY_WAY', 'RUNNING_LATE_2MIN'},
      );
    }
  });

  test('arrival messages are offered only after arrival is recorded', () {
    for (final status in ['DRIVER_ARRIVED', 'WAITING_CLIENT']) {
      expect(
        driverQuickMessageKeysForStatus(status),
        {'I_ARRIVED', 'PLEASE_COME_OUT'},
      );
    }
  });

  test('pickup vocabulary disappears during and after the trip', () {
    for (final status in [
      'SEARCHING_DRIVER',
      'TRIP_STARTED',
      'TRIP_COMPLETED',
      'PAID',
      'RATED',
      'CANCELLED_BY_CLIENT',
      'CANCELLED_BY_DRIVER',
    ]) {
      expect(driverQuickMessageKeysForStatus(status), isEmpty);
    }
  });
}
