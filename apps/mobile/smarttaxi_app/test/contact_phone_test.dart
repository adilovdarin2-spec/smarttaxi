import 'package:flutter_test/flutter_test.dart';
import 'package:smarttaxi_app/core/utils/contact_phone.dart';

void main() {
  test('accepts a configured, non-placeholder service phone', () {
    expect(usableServicePhone('+7 701 923 9876'), '+7 701 923 9876');
  });

  test('rejects seeded and malformed service phone placeholders', () {
    expect(usableServicePhone('+77000000000'), isNull);
    final incrementalSeed = ['+7701', '123', '4567'].join();
    expect(usableServicePhone(incrementalSeed), isNull);
    expect(usableServicePhone('0000000'), isNull);
    expect(usableServicePhone('112'), isNull);
  });
}
