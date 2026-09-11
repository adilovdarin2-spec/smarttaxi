import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:smarttaxi_app/core/utils/address_request_gate.dart';

void main() {
  test('a response during the next debounce cannot name the moved pin',
      () async {
    final gate = AddressRequestGate();
    final oldRequest = gate.invalidate();
    final response = Completer<String>();
    String? label;
    final pending = response.future.then((value) {
      if (gate.accepts(oldRequest)) label = value;
    });
    final nextRequest = gate.invalidate(); // movement, NOT HTTP dispatch
    response.complete('Old house');
    await pending;
    expect(label, isNull);
    expect(gate.accepts(nextRequest), isTrue);
  });

  test('close and reopen cannot revive the earlier pickup or destination', () {
    final gate = AddressRequestGate();
    final pickup = gate.invalidate();
    gate.invalidate(); // close
    final destination = gate.invalidate(); // reopen
    expect(gate.accepts(pickup), isFalse);
    expect(gate.accepts(destination), isTrue);
  });

  test('camera motion invalidates even before a new point is available', () {
    final gate = AddressRequestGate();
    final request = gate.invalidate();
    gate.invalidate(); // camera started moving
    expect(gate.accepts(request), isFalse);
  });

  test('clearing a query or switching region invalidates pending search', () {
    final gate = AddressRequestGate();
    final typed = gate.invalidate();
    gate.invalidate(); // clear while the old query is still in flight
    expect(gate.accepts(typed), isFalse);
    final regionA = gate.invalidate();
    gate.invalidate(); // region B, same text
    expect(gate.accepts(regionA), isFalse);
  });
}
