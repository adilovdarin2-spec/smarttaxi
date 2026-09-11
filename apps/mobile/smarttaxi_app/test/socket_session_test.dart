import 'package:flutter_test/flutter_test.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;
import 'package:smarttaxi_app/core/sockets/socket_service.dart';

void main() {
  test('account switch creates a new socket with the new session credentials',
      () {
    // Match the configured URL's empty path: the library caches that origin,
    // but stores its default namespace as '/', so dispose + io(same URL)
    // alone can return the previous account's socket. Auto-connect is off:
    // this test never contacts a server or uses real credentials.
    const origin = 'http://127.0.0.1:47831';
    final passenger = io.io(origin, socketOptionsForSession('local-passenger'));
    passenger.dispose();
    final driver = io.io(origin, socketOptionsForSession('local-driver'));
    addTearDown(driver.dispose);

    expect(identical(driver, passenger), isFalse);
    expect(identical(driver.io, passenger.io), isFalse);
    expect(driver.auth, {'token': 'local-driver'});
    expect(driver.connected, isFalse);
  });

  test(
      'reconnect policy is retained without inventing an unauthenticated token',
      () {
    final options = socketOptionsForSession(null);
    expect(options['autoConnect'], isFalse);
    // enableReconnection removes the opt-out key; the manager defaults to true.
    expect(options['reconnection'], isNot(false));
    expect(options['reconnectionDelay'], 1000);
    expect(options['reconnectionDelayMax'], 8000);
    expect(options['auth'], {'token': null});
  });
}
