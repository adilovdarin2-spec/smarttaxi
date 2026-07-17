import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:smarttaxi_app/features/driver/models/driver_shell_helpers.dart';

DioException _badResponse(String code, {int status = 400}) {
  final options = RequestOptions(path: '/api/drivers/me/location');
  return DioException(
    requestOptions: options,
    type: DioExceptionType.badResponse,
    response: Response(
      requestOptions: options,
      statusCode: status,
      data: {'error': code, 'message': 'irrelevant'},
    ),
  );
}

void main() {
  group('readableError', () {
    test('reads the backend error code from the Dio response body', () {
      // DioException.toString() never includes the response body (dio's
      // defaultDioExceptionReadableStringBuilder only describes the status
      // code generically), so a naive error.toString().contains(code) check
      // never matches a real backend rejection — every mapped message in
      // readableError() silently fell through to the generic fallback.
      expect(
        readableError(_badResponse('DRIVER_LOCATION_OUTSIDE_REGION')),
        'Геолокация вне рабочего региона',
      );
      expect(
        readableError(_badResponse('DRIVER_REGION_NOT_APPROVED')),
        'Вы не одобрены для этого региона',
      );
    });

    test('falls back to the generic message for an unmapped code', () {
      expect(
        readableError(_badResponse('SOME_NEW_BACKEND_CODE')),
        'Не удалось выполнить запрос',
      );
    });

    test('still recognizes connection failures without a response', () {
      final options = RequestOptions(path: '/api/drivers/me/status');
      final error = DioException(
        requestOptions: options,
        type: DioExceptionType.connectionError,
        error: 'SocketException: Failed host lookup',
      );
      expect(
        readableError(error),
        'Сервер недоступен. Проверьте подключение.',
      );
    });

    test('handles a non-Dio error without throwing', () {
      expect(readableError(Exception('boom')), 'Не удалось выполнить запрос');
    });
  });

  group('apiErrorCode', () {
    test('extracts the code driver_shell.dart branches on for approval'
        ' blocks (DRIVER_REGION_BLOCKED etc.)', () {
      // driver_shell.dart's _setOnline() used to test
      // approvalCodes.any(error.toString().contains) to decide whether a
      // go-online rejection should open the support sheet instead of just
      // showing the inline banner — same Dio toString gap, so that branch
      // was unreachable dead code for every real rejection.
      expect(
        apiErrorCode(_badResponse('DRIVER_REGION_BLOCKED', status: 403)),
        'DRIVER_REGION_BLOCKED',
      );
    });

    test('returns null for a non-Dio error', () {
      expect(apiErrorCode(Exception('boom')), isNull);
    });
  });
}
