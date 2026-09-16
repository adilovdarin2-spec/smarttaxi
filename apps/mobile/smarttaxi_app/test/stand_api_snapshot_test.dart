import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:smarttaxi_app/core/api/api_client.dart';

import 'api_transport_test.dart'
    show MemoryAuthStore, TestAdapter, jsonResponse;

void main() {
  for (final driver in [false, true]) {
    test(
        'personal stand outcome is scoped and rejects mismatched records, driver=$driver',
        () async {
      dynamic payload = {
        'outcome': {
          'id': 'own',
          'status': 'CANCELLED',
          'reason': 'STAND_CLOSED'
        }
      };
      final dio = Dio(BaseOptions(baseUrl: 'http://127.0.0.1:1'))
        ..httpClientAdapter = TestAdapter((request) async {
          expect(request.path,
              '${driver ? '/api/driver/stands/entries' : '/api/stands/reservations'}/own/status');
          return jsonResponse(payload);
        });
      addTearDown(() => dio.close(force: true));
      final api = ApiClient(MemoryAuthStore('test-session'), dio: dio);
      expect((await api.getStandOutcome('own', driver: driver)).reason,
          'STAND_CLOSED');
      for (final bad in [
        {},
        {'outcome': null},
        {
          'outcome': {'id': 'other', 'status': 'CANCELLED'}
        },
        {
          'outcome': {'id': 'own', 'status': 4}
        }
      ]) {
        payload = bad;
        await expectLater(api.getStandOutcome('own', driver: driver),
            throwsA(isA<FormatException>()));
      }
    });
    test(
        '${driver ? 'driver' : 'rider'} malformed stand state is not an empty queue',
        () async {
      final dio = Dio(BaseOptions(baseUrl: 'http://127.0.0.1:1'))
        ..httpClientAdapter =
            TestAdapter((_) async => jsonResponse({'ok': true}));
      addTearDown(() => dio.close(force: true));
      final api = ApiClient(MemoryAuthStore('test-session'), dio: dio);
      await expectLater(
          driver ? api.getMyStandPlace() : api.getMyStandReservation(),
          throwsA(isA<FormatException>()));
    });
    test(
        '${driver ? 'driver' : 'rider'} explicit null is a valid empty stand state',
        () async {
      final dio = Dio(BaseOptions(baseUrl: 'http://127.0.0.1:1'))
        ..httpClientAdapter = TestAdapter((_) async =>
            jsonResponse({driver ? 'entry' : 'reservation': null}));
      addTearDown(() => dio.close(force: true));
      final api = ApiClient(MemoryAuthStore('test-session'), dio: dio);
      if (driver) {
        expect((await api.getMyStandPlace()).entry, isNull);
      } else {
        expect(await api.getMyStandReservation(), isNull);
      }
    });
  }
}
