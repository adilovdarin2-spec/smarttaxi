import 'package:flutter_test/flutter_test.dart';
import 'package:smarttaxi_app/features/shared/models.dart';

void main() {
  const address = {'label': 'улица Абая, 14', 'lat': 40.7, 'lng': 68.52};
  test('unresolved server response is blocked even with a convincing label',
      () {
    expect(
        AddressSuggestion.fromJson({...address, 'fallback': true}).isResolved,
        isFalse);
    expect(AddressSuggestion.fromJson(address).isResolved, isTrue);
  });
  test('missing, nonnumeric and out-of-range coordinates cannot be confirmed',
      () {
    for (final bad in [
      null,
      '',
      'no coordinate',
      double.nan,
      double.infinity,
      91
    ]) {
      expect(AddressSuggestion.fromJson({...address, 'lat': bad}).isResolved,
          isFalse,
          reason: '$bad');
    }
    expect(AddressSuggestion.fromJson({...address, 'lng': 181}).isResolved,
        isFalse);
    expect(AddressSuggestion.fromJson({...address, 'lat': '40.7'}).isResolved,
        isTrue);
  });
}
