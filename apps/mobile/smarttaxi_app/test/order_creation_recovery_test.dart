import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:smarttaxi_app/core/api/api_client.dart';
import 'package:smarttaxi_app/features/shared/models.dart';

import 'api_transport_test.dart'
    show MemoryAuthStore, TestAdapter, jsonResponse;

const activeOrder = {
  'id': 'local-active-order',
  'status': 'SEARCHING',
  'pickup_text': 'Local pickup',
  'dropoff_text': 'Local destination',
  'price': 700,
};

Future<OrderSummary> createTestOrder(ApiClient api) => api.createOrder(
      pickup: const Coordinate(lat: 40.84621, lng: 68.50486),
      dropoff: const Coordinate(lat: 40.844435, lng: 68.509021),
      pickupText: 'Local pickup',
      dropoffText: 'Local destination',
      riderPhone: '+77000000001',
      tariffId: 'Economy',
      distanceKm: 0.7,
      durationMin: 4,
    );

class RecoveryFixture {
  RecoveryFixture(Future<ResponseBody> Function(RequestOptions) respond,
      {String? token = 'test-session'}) {
    store = MemoryAuthStore(token);
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

DioException lostResponse(RequestOptions request) => DioException(
    requestOptions: request,
    type: DioExceptionType.receiveTimeout,
    message: 'Original creation failure');

Matcher originalCreationFailure() => isA<DioException>()
    .having((error) => error.requestOptions.path, 'failed path', '/api/orders')
    .having((error) => error.message, 'original error',
        'Original creation failure');

void main() {
  test(
      'lost creation response restores the server order without replaying POST',
      () async {
    final adapter = TestAdapter((request) async {
      if (request.method == 'POST') {
        throw DioException(
            requestOptions: request, type: DioExceptionType.receiveTimeout);
      }
      expect(request.path, '/api/orders/me/active');
      return jsonResponse({'order': activeOrder});
    });
    final dio = Dio(BaseOptions(baseUrl: 'http://127.0.0.1:1'))
      ..httpClientAdapter = adapter;
    final api = ApiClient(MemoryAuthStore('test-session'), dio: dio);
    addTearDown(() => dio.close(force: true));

    final order = await createTestOrder(api);
    expect(order.id, 'local-active-order');
    expect(order.status, 'SEARCHING');
    expect(order.price, 700);
    expect(adapter.requests.map((request) => request.method), ['POST', 'GET']);
    expect(adapter.requests.map((request) => request.headers['Authorization']),
        everyElement('Bearer test-session'));
  });

  test('successful creation does not perform reconciliation', () async {
    final fixture =
        RecoveryFixture((_) async => jsonResponse({'order': activeOrder}));
    expect((await createTestOrder(fixture.api)).id, activeOrder['id']);
    expect(fixture.adapter.requests.length, 1);
  });

  test('all ambiguous connection failures permit only active-order reads',
      () async {
    for (final type in [
      DioExceptionType.connectionTimeout,
      DioExceptionType.sendTimeout,
      DioExceptionType.receiveTimeout,
      DioExceptionType.connectionError,
    ]) {
      final fixture = RecoveryFixture((request) async {
        if (request.method == 'POST') {
          throw DioException(requestOptions: request, type: type);
        }
        return jsonResponse({'order': activeOrder});
      });
      expect((await createTestOrder(fixture.api)).id, activeOrder['id']);
      expect(fixture.adapter.requests.map((request) => request.method),
          ['POST', 'GET'],
          reason: '$type');
    }
  });

  test('gateway/server errors reconcile without replaying the creation',
      () async {
    for (final status in [500, 502, 503, 504]) {
      final fixture = RecoveryFixture((request) async {
        if (request.method == 'POST') {
          return jsonResponse({'error': 'SERVER_FAILURE'}, status);
        }
        return jsonResponse({'order': activeOrder});
      });
      expect((await createTestOrder(fixture.api)).id, activeOrder['id']);
      expect(fixture.adapter.requests.map((request) => request.method),
          ['POST', 'GET'],
          reason: '$status');
    }
  });

  test('active-order conflict restores the actual outstanding settlement',
      () async {
    final fixture = RecoveryFixture((request) async {
      if (request.method == 'POST') {
        return jsonResponse({'error': 'CLIENT_HAS_ACTIVE_ORDER'}, 409);
      }
      return jsonResponse({
        'order': {...activeOrder, 'status': 'PAYMENT_PENDING', 'price': 850}
      });
    });
    final order = await createTestOrder(fixture.api);
    expect(order.id, activeOrder['id']);
    expect(order.status, 'PAYMENT_PENDING');
    expect(order.price, 850);
    expect(order.awaitsSettlement, isTrue);
    expect(fixture.adapter.requests.map((request) => request.method),
        ['POST', 'GET']);
  });

  test('validation, authorization and unrelated conflicts are not reconciled',
      () async {
    for (final status in [400, 401, 403, 409, 422, 429]) {
      final fixture = RecoveryFixture(
          (_) async => jsonResponse({'error': 'REJECTED'}, status));
      await expectLater(
          createTestOrder(fixture.api),
          throwsA(isA<DioException>().having(
              (error) => error.response?.statusCode, 'status', status)));
      expect(fixture.adapter.requests.length, 1, reason: '$status');
    }
  });

  test('cancellation and certificate failures do not trigger order recovery',
      () async {
    for (final type in [
      DioExceptionType.cancel,
      DioExceptionType.badCertificate
    ]) {
      final fixture = RecoveryFixture((request) async {
        throw DioException(requestOptions: request, type: type);
      });
      await expectLater(
          createTestOrder(fixture.api), throwsA(isA<DioException>()));
      expect(fixture.adapter.requests.length, 1);
    }
  });

  test('empty or malformed active-order responses never fabricate success',
      () async {
    for (final order in [
      null,
      'invalid',
      [],
      {},
      {'id': 'id-only'},
      {'status': 'NEW'},
      {'id': '', 'status': 'NEW'}
    ]) {
      final fixture = RecoveryFixture((request) async {
        if (request.method == 'POST') throw lostResponse(request);
        return jsonResponse({'order': order});
      });
      await expectLater(
          createTestOrder(fixture.api), throwsA(originalCreationFailure()));
      expect(fixture.adapter.requests.map((request) => request.method),
          ['POST', 'GET']);
    }
  });

  test('failed reconciliation preserves the original creation error', () async {
    final fixture = RecoveryFixture((request) async {
      if (request.method == 'POST') throw lostResponse(request);
      return jsonResponse({'error': 'READ_FAILED'}, 503);
    });
    await expectLater(
        createTestOrder(fixture.api), throwsA(originalCreationFailure()));
    expect(fixture.adapter.requests.map((request) => request.method),
        ['POST', 'GET']);
  });

  test('unauthenticated failures cannot recover an account order', () async {
    final fixture = RecoveryFixture(
        (request) async => throw lostResponse(request),
        token: null);
    await expectLater(
        createTestOrder(fixture.api), throwsA(originalCreationFailure()));
    expect(fixture.adapter.requests.length, 1);
  });

  test('logout before reconciliation prevents the account read', () async {
    late final RecoveryFixture fixture;
    fixture = RecoveryFixture((request) async {
      fixture.api.clearToken();
      await fixture.store.clear();
      throw lostResponse(request);
    });
    await expectLater(
        createTestOrder(fixture.api), throwsA(originalCreationFailure()));
    expect(fixture.adapter.requests.length, 1);
  });

  test('another login before the lost response prevents old-order recovery',
      () async {
    final started = Completer<void>();
    final pending = Completer<ResponseBody>();
    final fixture = RecoveryFixture((request) async {
      if (request.path == '/api/auth/login') {
        return jsonResponse({'token': 'new-test-session'});
      }
      started.complete();
      return pending.future;
    });
    final failure = expectLater(
        createTestOrder(fixture.api), throwsA(originalCreationFailure()));
    await started.future;
    await fixture.api.login(phone: '+77000000000', password: 'isolated-test');
    pending.completeError(lostResponse(fixture.adapter.requests.first));
    await failure;
    expect(fixture.adapter.requests.map((request) => request.path),
        ['/api/orders', '/api/auth/login']);
    expect(fixture.store.token, 'new-test-session');
  });

  test('another login during reconciliation discards the old order response',
      () async {
    final readStarted = Completer<void>();
    final pending = Completer<ResponseBody>();
    final fixture = RecoveryFixture((request) async {
      if (request.path == '/api/auth/login') {
        return jsonResponse({'token': 'new-test-session'});
      }
      if (request.method == 'POST') throw lostResponse(request);
      expect(request.headers['Authorization'], 'Bearer test-session');
      readStarted.complete();
      return pending.future;
    });
    final failure = expectLater(
        createTestOrder(fixture.api), throwsA(originalCreationFailure()));
    await readStarted.future;
    await fixture.api.login(phone: '+77000000000', password: 'isolated-test');
    pending.complete(jsonResponse({'order': activeOrder}));
    await failure;
    expect(fixture.store.token, 'new-test-session');
    expect(fixture.adapter.requests.length, 3);
  });

  test('storage verification failures cannot confirm an order', () async {
    for (final failAfterRead in [false, true]) {
      late final RecoveryFixture fixture;
      fixture = RecoveryFixture((request) async {
        if (request.method == 'POST') {
          if (!failAfterRead) {
            fixture.store.readOverride =
                () async => throw StateError('storage');
          }
          throw lostResponse(request);
        }
        fixture.store.readOverride = () async => throw StateError('storage');
        return jsonResponse({'order': activeOrder});
      });
      await expectLater(
          createTestOrder(fixture.api), throwsA(originalCreationFailure()));
      expect(fixture.adapter.requests.length, failAfterRead ? 2 : 1);
    }
  });
}
