import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:smarttaxi_app/core/api/api_client.dart';

import 'api_transport_test.dart'
    show MemoryAuthStore, TestAdapter, jsonResponse;

const favorite = {
  'id': 'favorite-1',
  'label': 'HOME',
  'title': 'Дом',
  'addressText': 'улица Абая, 10',
  'lat': 42.315,
  'lng': 69.595,
};

class FavoriteFixture {
  FavoriteFixture(Future<ResponseBody> Function(RequestOptions) respond) {
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

DioException lostWrite(RequestOptions request) => DioException(
      requestOptions: request,
      type: DioExceptionType.receiveTimeout,
      message: 'Original favorite write failure',
    );

Future<dynamic> createFavorite(ApiClient api) => api.createFavoriteAddress(
      label: 'HOME',
      title: 'Дом',
      addressText: 'улица Абая, 10',
      lat: 42.315,
      lng: 69.595,
    );

void main() {
  test('confirmed create returns exact server address without extra read',
      () async {
    final fixture =
        FavoriteFixture((_) async => jsonResponse({'address': favorite}, 201));
    final result = await createFavorite(fixture.api);
    expect(result.id, 'favorite-1');
    expect(fixture.adapter.requests.map((request) => request.method), ['POST']);
  });

  test('lost create response reconciles once without replaying POST', () async {
    final fixture = FavoriteFixture((request) async {
      if (request.method == 'POST') throw lostWrite(request);
      expect(request.path, '/api/favorites/addresses');
      return jsonResponse({
        'addresses': [favorite]
      });
    });
    final result = await createFavorite(fixture.api);
    expect(result.id, 'favorite-1');
    expect(fixture.adapter.requests.map((request) => request.method),
        ['POST', 'GET']);
    expect(
      fixture.adapter.requests
          .map((request) => request.headers['Authorization']),
      everyElement('Bearer test-session'),
    );
  });

  test('malformed create acknowledgement also uses authoritative read',
      () async {
    final fixture = FavoriteFixture((request) async {
      if (request.method == 'POST') return jsonResponse({'ok': true}, 201);
      return jsonResponse({
        'addresses': [favorite]
      });
    });
    expect((await createFavorite(fixture.api)).id, 'favorite-1');
    expect(fixture.adapter.requests.map((request) => request.method),
        ['POST', 'GET']);
  });

  test('unconfirmed create blocks a blind retry at the API boundary', () async {
    final fixture = FavoriteFixture((request) async {
      if (request.method == 'POST') throw lostWrite(request);
      return jsonResponse({'addresses': []});
    });
    await expectLater(
      createFavorite(fixture.api),
      throwsA(isA<FavoriteAddressMutationUnconfirmed>()),
    );
    expect(fixture.adapter.requests.map((request) => request.method),
        ['POST', 'GET']);
  });

  test('lost delete and already-absent 404 reconcile by exact id', () async {
    for (final failure in ['timeout', 'not-found']) {
      final fixture = FavoriteFixture((request) async {
        if (request.method == 'DELETE') {
          if (failure == 'timeout') throw lostWrite(request);
          return jsonResponse({'error': 'FAVORITE_ADDRESS_NOT_FOUND'}, 404);
        }
        return jsonResponse({'addresses': []});
      });
      await fixture.api.deleteFavoriteAddress('favorite-1');
      expect(fixture.adapter.requests.map((request) => request.method),
          ['DELETE', 'GET']);
    }
  });

  test('delete remains uncertain while exact id is still present', () async {
    final fixture = FavoriteFixture((request) async {
      if (request.method == 'DELETE') throw lostWrite(request);
      return jsonResponse({
        'addresses': [favorite]
      });
    });
    await expectLater(
      fixture.api.deleteFavoriteAddress('favorite-1'),
      throwsA(isA<FavoriteAddressMutationUnconfirmed>()),
    );
    expect(fixture.adapter.requests.map((request) => request.method),
        ['DELETE', 'GET']);
  });

  test('validation failures never trigger a reconciliation read', () async {
    final fixture = FavoriteFixture(
        (_) async => jsonResponse({'error': 'VALIDATION_ERROR'}, 422));
    await expectLater(
        createFavorite(fixture.api), throwsA(isA<DioException>()));
    expect(fixture.adapter.requests.length, 1);
  });

  test('replacement session prevents an old write from reading favorites',
      () async {
    final started = Completer<void>();
    final pending = Completer<ResponseBody>();
    late final FavoriteFixture fixture;
    fixture = FavoriteFixture((request) async {
      if (request.path == '/api/auth/login') {
        return jsonResponse({'token': 'new-session'});
      }
      started.complete();
      return pending.future;
    });
    final failure = expectLater(
      createFavorite(fixture.api),
      throwsA(isA<FavoriteAddressMutationUnconfirmed>()),
    );
    await started.future;
    await fixture.api.login(phone: '+77000000000', password: 'isolated-test');
    pending.completeError(lostWrite(fixture.adapter.requests.first));
    await failure;
    expect(fixture.adapter.requests.map((request) => request.path),
        ['/api/favorites/addresses', '/api/auth/login']);
    expect(fixture.store.token, 'new-session');
  });
}
