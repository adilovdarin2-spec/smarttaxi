import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:smarttaxi_app/core/api/api_client.dart';

import 'api_transport_test.dart'
    show MemoryAuthStore, TestAdapter, jsonResponse;

const cancelledOrder = {
  'id': 'local-order',
  'status': 'CANCELLED_BY_CLIENT',
  'pickup_text': 'Local pickup',
  'dropoff_text': 'Local destination',
};

class CancellationFixture {
  CancellationFixture(Future<ResponseBody> Function(RequestOptions) respond) {
    store = MemoryAuthStore('test-session');
    adapter = TestAdapter(respond);
    dio = Dio(BaseOptions(baseUrl: 'http://127.0.0.1:1'))
      ..httpClientAdapter = adapter;
    api = ApiClient(store, dio: dio, retryDelay: (_) async {});
    addTearDown(() => dio.close(force: true));
  }
  late final MemoryAuthStore store;
  late final TestAdapter adapter;
  late final Dio dio;
  late final ApiClient api;
}

DioException lostCancellation(RequestOptions request) => DioException(
      requestOptions: request,
      type: DioExceptionType.receiveTimeout,
      message: 'Original cancellation failure',
    );

void main() {
  test('confirmed cancellation returns the server cancellation screen state',
      () async {
    final fixture = CancellationFixture(
        (_) async => jsonResponse({'order': cancelledOrder}));
    final order = await fixture.api.cancelPublicOrder(
      'local-order',
      riderPhone: '+77000000001',
    );
    expect(order.id, 'local-order');
    expect(order.status, 'CANCELLED_BY_CLIENT');
    expect(fixture.adapter.requests.map((request) => request.method), ['POST']);
  });

  test('lost cancellation response reads status once without replaying POST',
      () async {
    final fixture = CancellationFixture((request) async {
      if (request.method == 'POST') throw lostCancellation(request);
      expect(request.path, '/api/orders/local-order/status-history');
      return jsonResponse({'order': cancelledOrder, 'history': []});
    });
    final order = await fixture.api.cancelPublicOrder(
      'local-order',
      riderPhone: '+77000000001',
    );
    expect(order.status, 'CANCELLED_BY_CLIENT');
    expect(fixture.adapter.requests.map((request) => request.method),
        ['POST', 'GET']);
    expect(
        fixture.adapter.requests
            .map((request) => request.headers['Authorization']),
        everyElement('Bearer test-session'));
  });

  test('5xx and legacy already-applied conflict reconcile cancellation',
      () async {
    for (final failure in [
      (status: 503, code: 'SERVER_FAILURE'),
      (status: 409, code: 'INVALID_STATUS_TRANSITION'),
    ]) {
      final fixture = CancellationFixture((request) async {
        if (request.method == 'POST') {
          return jsonResponse({'error': failure.code}, failure.status);
        }
        return jsonResponse({'order': cancelledOrder, 'history': []});
      });
      expect(
        (await fixture.api.cancelPublicOrder(
          'local-order',
          riderPhone: '+77000000001',
        ))
            .status,
        'CANCELLED_BY_CLIENT',
      );
      expect(fixture.adapter.requests.map((request) => request.method),
          ['POST', 'GET']);
    }
  });

  test('unconfirmed read preserves original cancellation failure', () async {
    final fixture = CancellationFixture((request) async {
      if (request.method == 'POST') throw lostCancellation(request);
      return jsonResponse({
        'order': {...cancelledOrder, 'status': 'SEARCHING_DRIVER'},
        'history': [],
      });
    });
    await expectLater(
      fixture.api.cancelPublicOrder(
        'local-order',
        riderPhone: '+77000000001',
      ),
      throwsA(isA<DioException>().having(
        (error) => error.message,
        'original error',
        'Original cancellation failure',
      )),
    );
    expect(fixture.adapter.requests.map((request) => request.method),
        ['POST', 'GET']);
  });

  test('validation, authorization and rate limits do not read status',
      () async {
    for (final status in [400, 401, 403, 422, 429]) {
      final fixture = CancellationFixture(
          (_) async => jsonResponse({'error': 'REJECTED'}, status));
      await expectLater(
        fixture.api.cancelPublicOrder(
          'local-order',
          riderPhone: '+77000000001',
        ),
        throwsA(isA<DioException>()),
      );
      expect(fixture.adapter.requests.length, 1);
    }
  });

  test('replacement session prevents old cancellation reconciliation',
      () async {
    final started = Completer<void>();
    final pending = Completer<ResponseBody>();
    late final CancellationFixture fixture;
    fixture = CancellationFixture((request) async {
      if (request.path == '/api/auth/login') {
        return jsonResponse({'token': 'new-session'});
      }
      started.complete();
      return pending.future;
    });
    final failure = expectLater(
      fixture.api.cancelPublicOrder(
        'local-order',
        riderPhone: '+77000000001',
      ),
      throwsA(isA<DioException>()),
    );
    await started.future;
    await fixture.api.login(phone: '+77000000000', password: 'isolated-test');
    pending.completeError(lostCancellation(fixture.adapter.requests.first));
    await failure;
    expect(fixture.adapter.requests.map((request) => request.path),
        ['/api/orders/local-order/cancel-public', '/api/auth/login']);
    expect(fixture.store.token, 'new-session');
  });
}
