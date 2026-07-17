import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:smarttaxi_app/features/driver/models/driver_shell_helpers.dart';
import 'package:smarttaxi_app/features/shared/models.dart';

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

  group('maneuverLabelAndIcon', () {
    test('maps real OSRM turn types/modifiers to Russian labels', () {
      // Real values OSRM actually sends (routing.service.js's steps=true,
      // confirmed live against router.project-osrm.org near Мырзакент) —
      // not a hypothetical vocabulary.
      expect(maneuverLabelAndIcon('turn', 'left').$1, 'Поворот налево');
      expect(maneuverLabelAndIcon('turn', 'right').$1, 'Поворот направо');
      expect(
          maneuverLabelAndIcon('turn', 'slight left').$1, 'Держитесь левее');
      expect(maneuverLabelAndIcon('roundabout', 'right').$1,
          'Круговое движение');
      expect(maneuverLabelAndIcon('arrive', null).$1, 'Вы почти на месте');
      // OSRM's 'continue' type (confirmed live: a Shymkent route returned
      // "continue"/"right" for a bend that keeps the same street name) used
      // to silently fall through to the generic default, dropping the
      // direction it actually carries.
      expect(maneuverLabelAndIcon('continue', 'right').$1, 'Поворот направо');
    });

    test('includes the roundabout exit number when OSRM provides one', () {
      expect(maneuverLabelAndIcon('roundabout', null, exit: 2).$1,
          'Круговое движение, 2-й съезд');
      expect(maneuverLabelAndIcon('roundabout', null).$1, 'Круговое движение');
    });

    test('falls back to a generic label for an unrecognized type', () {
      expect(maneuverLabelAndIcon('notification', null).$1,
          'Двигайтесь по маршруту');
    });
  });

  group('RoutePreview.fromJson steps', () {
    test('parses real OSRM steps=true shape (routing.service.js parseSteps)',
        () {
      // Matches parseSteps' actual output shape, itself confirmed against a
      // live OSRM steps=true response near Мырзакент (see status doc).
      final route = RoutePreview.fromJson({
        'regionId': 'region-1',
        'distanceMeters': 940.5,
        'durationSeconds': 73.1,
        'geometry': {
          'type': 'LineString',
          'coordinates': [
            [68.543, 40.666],
            [68.549, 40.667],
          ],
        },
        'steps': [
          {
            'type': 'depart',
            'modifier': 'left',
            'streetName': '',
            'distanceMeters': 47,
            'lat': 40.666104,
            'lng': 68.543383,
          },
          {
            'type': 'turn',
            'modifier': 'right',
            'streetName': 'улица Кожанова',
            'distanceMeters': 526,
            'lat': 40.666525,
            'lng': 68.54342,
          },
          {
            'type': 'roundabout',
            'modifier': 'right',
            'streetName': '',
            'distanceMeters': 80,
            'lat': 40.6668,
            'lng': 68.5441,
            'exit': 2,
          },
        ],
      });
      expect(route.steps, hasLength(3));
      expect(route.steps[0].type, 'depart');
      expect(route.steps[1].streetName, 'улица Кожанова');
      expect(route.steps[1].modifier, 'right');
      expect(route.steps[1].location.lat, 40.666525);
      expect(route.steps[1].exit, isNull);
      expect(route.steps[2].exit, 2);
    });

    test('defaults to an empty step list for the straight-line fallback',
        () {
      final route = RoutePreview.fromJson({
        'regionId': 'region-1',
        'distanceMeters': 100.0,
        'durationSeconds': 20.0,
        'geometry': {
          'type': 'LineString',
          'coordinates': [
            [68.543, 40.666],
            [68.549, 40.667],
          ],
        },
        'steps': <Map<String, dynamic>>[],
      });
      expect(route.steps, isEmpty);
    });
  });
}
