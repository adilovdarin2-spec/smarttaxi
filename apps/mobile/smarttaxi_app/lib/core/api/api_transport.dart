import 'package:dio/dio.dart';

/// Transport recovery must not replay actions or affect a replacement session.
void installApiTransportGuards(
  Dio dio, {
  required Future<String?> Function() readToken,
  required void Function() onSessionExpired,
  Future<void> Function(Duration)? retryDelay,
}) {
  final wait = retryDelay ?? (duration) => Future<void>.delayed(duration);
  String? expiredAuthorization;
  bool sameSession(RequestOptions request) =>
      request.headers['Authorization'] == dio.options.headers['Authorization'];

  dio.interceptors.add(InterceptorsWrapper(onError: (error, handler) async {
    final request = error.requestOptions;
    const retriable = {
      DioExceptionType.connectionTimeout,
      DioExceptionType.receiveTimeout,
      DioExceptionType.connectionError,
    };
    final attempt = (request.extra['coldStartAttempt'] as int?) ?? 0;
    final safeRead = const {'GET', 'HEAD', 'OPTIONS'}.contains(request.method);
    final repeatableBody = request.data is! FormData && request.data is! Stream;
    if (safeRead &&
        repeatableBody &&
        error.response == null &&
        retriable.contains(error.type) &&
        attempt < 2 &&
        request.cancelToken?.isCancelled != true &&
        sameSession(request)) {
      // A receive timeout does not tell us whether the server committed an
      // action. Never replay POST/PATCH/PUT/DELETE without a server-owned
      // idempotency contract. Cold-backend reads retain the 1s/3s backoff.
      await wait(Duration(seconds: attempt == 0 ? 1 : 3));
      if (request.cancelToken?.isCancelled == true || !sameSession(request)) {
        return handler.next(error);
      }
      request.extra = {...request.extra, 'coldStartAttempt': attempt + 1};
      try {
        return handler.resolve(await dio.fetch(request));
      } on DioException catch (retryError) {
        return handler.next(retryError);
      }
    }
    handler.next(error);
  }));

  dio.interceptors.add(InterceptorsWrapper(onError: (error, handler) async {
    final code = error.response?.data is Map
        ? (error.response?.data as Map)['error']
        : null;
    final authorization = error.requestOptions.headers['Authorization'];
    if (error.response?.statusCode == 401 &&
        code == 'SESSION_SUPERSEDED' &&
        authorization is String &&
        authorization.startsWith('Bearer ') &&
        authorization.length > 7 &&
        sameSession(error.requestOptions)) {
      try {
        final currentToken = await readToken();
        // Storage can yield while another login completes. Check both the
        // stored identity and the live header again after that async boundary.
        if (currentToken != null &&
            currentToken.isNotEmpty &&
            authorization == 'Bearer $currentToken' &&
            sameSession(error.requestOptions) &&
            expiredAuthorization != authorization) {
          expiredAuthorization = authorization;
          onSessionExpired();
        }
      } catch (_) {
        // A storage failure is not proof that this response owns the current
        // session. Preserve the original API rejection instead of hanging Dio.
      }
    }
    handler.next(error);
  }));
}
