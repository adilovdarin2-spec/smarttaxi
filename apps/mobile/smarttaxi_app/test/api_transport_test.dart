import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:smarttaxi_app/core/api/api_client.dart';
import 'package:smarttaxi_app/core/auth/auth_store.dart';
import 'package:smarttaxi_app/features/shared/models.dart';

class MemoryAuthStore extends AuthStore {
  MemoryAuthStore(this.token);
  String? token;
  Future<String?> Function()? readOverride;
  @override
  Future<String?> readToken() => readOverride?.call() ?? Future.value(token);
  @override
  Future<void> saveToken(String value) async => token = value;
  @override
  Future<void> clear() async => token = null;
}

class TestAdapter implements HttpClientAdapter {
  TestAdapter(this.respond);
  final Future<ResponseBody> Function(RequestOptions) respond;
  final List<RequestOptions> requests = [];
  @override
  Future<ResponseBody> fetch(RequestOptions options,
      Stream<Uint8List>? requestStream, Future<void>? cancelFuture) {
    expect(options.uri.host, '127.0.0.1',
        reason: 'No real network in transport tests');
    requests.add(options);
    return respond(options);
  }

  @override
  void close({bool force = false}) {}
}

ResponseBody jsonResponse(Object data, [int status = 200]) =>
    ResponseBody.fromString(jsonEncode(data), status, headers: {
      Headers.contentTypeHeader: [Headers.jsonContentType]
    });

void main() {
  test('late old-session 401 does not expire a successful newer login',
      () async {
    final store = MemoryAuthStore('old-test-session');
    final started = Completer<void>();
    final pending = Completer<ResponseBody>();
    final adapter = TestAdapter((request) async {
      if (request.path == '/api/auth/login') {
        return jsonResponse({
          'token': 'new-test-session',
          'user': {'role': 'DRIVER'}
        });
      }
      started.complete();
      return pending.future;
    });
    final dio = Dio(BaseOptions(baseUrl: 'http://127.0.0.1:1'))
      ..httpClientAdapter = adapter;
    final api = ApiClient(store, dio: dio);
    addTearDown(() => dio.close(force: true));
    var expired = 0;
    api.onSessionExpired = () => expired++;
    final oldRead = api.me();
    final oldFailure = expectLater(oldRead, throwsA(isA<DioException>()));
    await started.future;
    await api.login(phone: '+77000000000', password: 'isolated-test');
    pending.complete(jsonResponse({'error': 'SESSION_SUPERSEDED'}, 401));
    await oldFailure;
    expect(expired, 0);
    expect(store.token, 'new-test-session');
  });

  test('ambiguous order receive-timeout must not replay POST', () async {
    final store = MemoryAuthStore('test-session');
    final adapter = TestAdapter((request) async {
      // The server may have created the order before the response was lost.
      throw DioException(
          requestOptions: request, type: DioExceptionType.receiveTimeout);
    });
    final dio = Dio(BaseOptions(baseUrl: 'http://127.0.0.1:1'))
      ..httpClientAdapter = adapter;
    final api = ApiClient(store, dio: dio, retryDelay: (_) async {});
    addTearDown(() => dio.close(force: true));
    await expectLater(
        api.createOrder(
          pickup: const Coordinate(lat: 40.84621, lng: 68.50486),
          dropoff: const Coordinate(lat: 40.844435, lng: 68.509021),
          pickupText: 'Local test pickup',
          dropoffText: 'Local test destination',
          riderPhone: '+77000000001',
          tariffId: 'Economy',
          distanceKm: 0.7,
          durationMin: 4,
        ),
        throwsA(isA<DioException>()));
    expect(
        adapter.requests.where((request) => request.method == 'POST').length, 1,
        reason: 'Never silently replay order creation');
    expect(
        adapter.requests.where((request) => request.method == 'GET').length, 3,
        reason: 'Only safe active-order reads may retry');
  });

  test('cold-backend GET retries twice with the existing 1s and 3s backoff',
      () async {
    var calls = 0;
    final adapter = TestAdapter((request) async {
      if (++calls < 3) {
        throw DioException(
            requestOptions: request, type: DioExceptionType.connectionTimeout);
      }
      return jsonResponse({
        'user': {'id': 'local-test-user'}
      });
    });
    final dio = Dio(BaseOptions(baseUrl: 'http://127.0.0.1:1'))
      ..httpClientAdapter = adapter;
    final delays = <Duration>[];
    final api = ApiClient(MemoryAuthStore('test-session'), dio: dio,
        retryDelay: (delay) async {
      delays.add(delay);
    });
    addTearDown(() => dio.close(force: true));
    expect((await api.me())['user']['id'], 'local-test-user');
    expect(calls, 3);
    expect(delays, [const Duration(seconds: 1), const Duration(seconds: 3)]);
    expect(adapter.requests.map((request) => request.headers['Authorization']),
        everyElement('Bearer test-session'));
  });

  test('a failed read stops after two retries and preserves its error',
      () async {
    final adapter = TestAdapter((request) async {
      throw DioException(
          requestOptions: request, type: DioExceptionType.receiveTimeout);
    });
    final dio = Dio(BaseOptions(baseUrl: 'http://127.0.0.1:1'))
      ..httpClientAdapter = adapter;
    final api = ApiClient(MemoryAuthStore('test-session'),
        dio: dio, retryDelay: (_) async {});
    addTearDown(() => dio.close(force: true));
    await expectLater(
        api.me(),
        throwsA(isA<DioException>().having(
            (error) => error.type, 'type', DioExceptionType.receiveTimeout)));
    expect(adapter.requests.length, 3);
  });

  test('no write verb is replayed for any cold-start network error', () async {
    final adapter = TestAdapter((request) async {
      throw DioException(
          requestOptions: request,
          type: request.extra['testError'] as DioExceptionType);
    });
    final dio = Dio(BaseOptions(baseUrl: 'http://127.0.0.1:1'))
      ..httpClientAdapter = adapter;
    ApiClient(MemoryAuthStore(null),
        dio: dio,
        retryDelay: (_) async => fail('Writes must never enter retry backoff'));
    addTearDown(() => dio.close(force: true));
    for (final method in ['POST', 'PATCH', 'PUT', 'DELETE']) {
      for (final type in [
        DioExceptionType.connectionTimeout,
        DioExceptionType.receiveTimeout,
        DioExceptionType.connectionError
      ]) {
        final before = adapter.requests.length;
        await expectLater(
            dio.request<Object>('/test-action',
                data: {'value': 1},
                options: Options(method: method, extra: {'testError': type})),
            throwsA(isA<DioException>()));
        expect(adapter.requests.length, before + 1, reason: '$method / $type');
      }
    }
  });

  test('actual HTTP rejections are not retried or mistaken for session expiry',
      () async {
    var status = 503;
    final adapter = TestAdapter(
        (_) async => jsonResponse({'error': 'SERVICE_UNAVAILABLE'}, status));
    final dio = Dio(BaseOptions(baseUrl: 'http://127.0.0.1:1'))
      ..httpClientAdapter = adapter;
    final api = ApiClient(MemoryAuthStore('test-session'),
        dio: dio,
        retryDelay: (_) async => fail('An HTTP answer must not be retried'));
    var expired = 0;
    api.onSessionExpired = () => expired++;
    addTearDown(() => dio.close(force: true));
    for (final code in [503, 403, 401]) {
      status = code;
      await expectLater(
          api.me(),
          throwsA(isA<DioException>().having(
              (error) => error.response?.statusCode, 'HTTP status', code)));
    }
    expect(adapter.requests.length, 3);
    expect(expired, 0);
  });

  test('cancellation during backoff prevents the pending retry', () async {
    final cancellation = CancelToken();
    final adapter = TestAdapter((request) async {
      throw DioException(
          requestOptions: request, type: DioExceptionType.connectionError);
    });
    final dio = Dio(BaseOptions(baseUrl: 'http://127.0.0.1:1'))
      ..httpClientAdapter = adapter;
    ApiClient(MemoryAuthStore(null), dio: dio, retryDelay: (_) async {
      cancellation.cancel('screen closed');
    });
    addTearDown(() => dio.close(force: true));
    await expectLater(dio.get<Object>('/test-read', cancelToken: cancellation),
        throwsA(isA<DioException>()));
    expect(adapter.requests.length, 1);
  });

  test('logout during backoff cannot resend an authenticated read', () async {
    final adapter = TestAdapter((request) async {
      throw DioException(
          requestOptions: request, type: DioExceptionType.connectionError);
    });
    final dio = Dio(BaseOptions(baseUrl: 'http://127.0.0.1:1'))
      ..httpClientAdapter = adapter;
    late final ApiClient api;
    api = ApiClient(MemoryAuthStore('old-test-session'), dio: dio,
        retryDelay: (_) async {
      api.clearToken();
    });
    addTearDown(() => dio.close(force: true));
    await expectLater(api.me(), throwsA(isA<DioException>()));
    expect(adapter.requests.length, 1);
    expect(dio.options.headers['Authorization'], null);
  });

  test('a new login during backoff cannot replay the old account request',
      () async {
    final adapter = TestAdapter((request) async {
      if (request.path == '/api/auth/login') {
        return jsonResponse({'token': 'new-test-session'});
      }
      throw DioException(
          requestOptions: request, type: DioExceptionType.connectionError);
    });
    final dio = Dio(BaseOptions(baseUrl: 'http://127.0.0.1:1'))
      ..httpClientAdapter = adapter;
    late final ApiClient api;
    api = ApiClient(MemoryAuthStore('old-test-session'), dio: dio,
        retryDelay: (_) async {
      await api.login(phone: '+77000000000', password: 'isolated-test');
    });
    addTearDown(() => dio.close(force: true));
    await expectLater(api.me(), throwsA(isA<DioException>()));
    expect(
        adapter.requests
            .where((request) => request.path == '/api/auth/me')
            .length,
        1);
    expect(dio.options.headers['Authorization'], 'Bearer new-test-session');
  });

  test('concurrent superseded responses for the current session notify once',
      () async {
    final adapter = TestAdapter(
        (_) async => jsonResponse({'error': 'SESSION_SUPERSEDED'}, 401));
    final dio = Dio(BaseOptions(baseUrl: 'http://127.0.0.1:1'))
      ..httpClientAdapter = adapter;
    final api = ApiClient(MemoryAuthStore('test-session'), dio: dio);
    var expired = 0;
    api.onSessionExpired = () => expired++;
    addTearDown(() => dio.close(force: true));
    await Future.wait(List.generate(
        3, (_) => expectLater(api.me(), throwsA(isA<DioException>()))));
    expect(expired, 1);
  });

  test(
      'a late superseded response after logout does not request another logout',
      () async {
    final started = Completer<void>();
    final pending = Completer<ResponseBody>();
    final adapter = TestAdapter((_) async {
      started.complete();
      return pending.future;
    });
    final dio = Dio(BaseOptions(baseUrl: 'http://127.0.0.1:1'))
      ..httpClientAdapter = adapter;
    final store = MemoryAuthStore('test-session');
    final api = ApiClient(store, dio: dio);
    var expired = 0;
    api.onSessionExpired = () => expired++;
    addTearDown(() => dio.close(force: true));
    final failure = expectLater(api.me(), throwsA(isA<DioException>()));
    await started.future;
    api.clearToken();
    await store.clear();
    pending.complete(jsonResponse({'error': 'SESSION_SUPERSEDED'}, 401));
    await failure;
    expect(expired, 0);
  });

  test(
      'new login while secure-storage verification waits also defeats stale expiry',
      () async {
    final requestStarted = Completer<void>();
    final oldResponse = Completer<ResponseBody>();
    final storageStarted = Completer<void>();
    final storageResult = Completer<String?>();
    final adapter = TestAdapter((request) async {
      if (request.path == '/api/auth/login') {
        return jsonResponse({'token': 'new-test-session'});
      }
      requestStarted.complete();
      return oldResponse.future;
    });
    final dio = Dio(BaseOptions(baseUrl: 'http://127.0.0.1:1'))
      ..httpClientAdapter = adapter;
    final store = MemoryAuthStore('old-test-session');
    final api = ApiClient(store, dio: dio);
    var expired = 0;
    api.onSessionExpired = () => expired++;
    addTearDown(() => dio.close(force: true));
    final failure = expectLater(api.me(), throwsA(isA<DioException>()));
    await requestStarted.future;
    store.readOverride = () {
      storageStarted.complete();
      return storageResult.future;
    };
    oldResponse.complete(jsonResponse({'error': 'SESSION_SUPERSEDED'}, 401));
    await storageStarted.future;
    await api.login(phone: '+77000000000', password: 'isolated-test');
    storageResult.complete('old-test-session');
    await failure;
    expect(expired, 0);
  });

  test(
      'secure-storage failure preserves the API rejection without forced logout',
      () async {
    final store = MemoryAuthStore('test-session');
    final adapter = TestAdapter((_) async {
      store.readOverride = () async => throw StateError('storage unavailable');
      return jsonResponse({'error': 'SESSION_SUPERSEDED'}, 401);
    });
    final dio = Dio(BaseOptions(baseUrl: 'http://127.0.0.1:1'))
      ..httpClientAdapter = adapter;
    final api = ApiClient(store, dio: dio);
    var expired = 0;
    api.onSessionExpired = () => expired++;
    addTearDown(() => dio.close(force: true));
    await expectLater(
        api.me(),
        throwsA(isA<DioException>().having(
            (error) => error.response?.statusCode, 'HTTP status', 401)));
    expect(expired, 0);
  });
}
