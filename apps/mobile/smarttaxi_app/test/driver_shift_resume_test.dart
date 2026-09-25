import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

String _read(String path) => File(path).readAsStringSync();

void main() {
  // driverShouldResumeShift is unit-tested next door; what cannot be proved
  // there is that the shell still asks it. This defect was invisible for the
  // whole life of the app precisely because nothing on the driver side ever
  // read the server's idea of the shift back, and a refactor that dropped
  // the call would restore it just as quietly.
  test('the driver shell reads the shift back from the server on launch', () {
    final shell = _read('lib/features/driver/driver_shell.dart');
    final api = _read('lib/core/api/api_client.dart');

    // The status has to survive the trip from the response to the shell.
    expect(api, contains("driverJson['status']?.toString()"));
    expect(shell, contains('_serverDriverStatus = result.status;'));

    // Asked at launch, not only when an order happens to be active.
    expect(shell, contains('unawaited(_resumeShiftFromServer());'));
    final bootstrap = shell.substring(
      shell.indexOf('Future<void> _bootstrap() async {'),
      shell.indexOf('Future<void> _loadServiceContacts()'),
    );
    expect(bootstrap, contains('_resumeShiftFromServer()'));

    final resume = shell.substring(
      shell.indexOf('Future<void> _resumeShiftFromServer() async {'),
      shell.indexOf('Future<void> _restoreLocationForActiveOrder()'),
    );
    expect(resume, contains('driverShouldResumeShift('));
    // Claiming to be online without a GPS stream is the same lie pointed the
    // other way: a car on the rider's map that never moves. If the stream
    // will not start, the shift ends on the server.
    expect(resume, contains('_startLocationFlow()'));
    expect(resume, contains("widget.api.setDriverStatus('OFFLINE')"));
  });

  test('the dashboard does not queue behind the slow reads it never uses', () {
    final shell = _read('lib/features/driver/driver_shell.dart');
    final bootstrap = shell.substring(
      shell.indexOf('Future<void> _bootstrap() async {'),
      shell.indexOf('Future<void> _loadAccountPreferences()'),
    );

    // Measured on the emulator before this was changed: 2.0s for the socket,
    // 3.3s reading the account out of secure storage, 0.5s for the voice
    // flag — all in front of the first request the dashboard actually needs.
    // The region load has to be in flight before any of them is waited on.
    final regionsStart = bootstrap.indexOf('final regions = _loadRegions();');
    final socketAwait = bootstrap.indexOf('await widget.sockets.connect();');
    expect(regionsStart, greaterThan(-1),
        reason: 'the region load must start on its own, not be awaited inline');
    expect(regionsStart, lessThan(socketAwait));

    // Nothing out of secure storage may be awaited before the regions are.
    final regionsAwait = bootstrap.indexOf('await regions;');
    expect(regionsAwait, greaterThan(-1));
    for (final read in ['readUser()', 'readVoiceEnabled()']) {
      expect(bootstrap.contains(read), isFalse,
          reason: '$read belongs off the critical path');
    }
    expect(bootstrap.indexOf('final preferences = _loadAccountPreferences();'),
        lessThan(regionsAwait));
    // Started work still has to be waited on, or a failure inside it becomes
    // an unhandled async error with no owner.
    expect(bootstrap, contains('await preferences;'));

    // Orders stay behind both: behind the socket so an update arriving mid
    // load is not dropped, behind the regions so they are filtered by the
    // region the driver actually works in.
    expect(socketAwait, lessThan(bootstrap.indexOf('await _loadOrders();')));
    expect(regionsAwait, lessThan(bootstrap.indexOf('await _loadOrders();')));
  });
}
