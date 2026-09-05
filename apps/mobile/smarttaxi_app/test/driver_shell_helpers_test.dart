import 'package:dio/dio.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:smarttaxi_app/features/driver/models/driver_shell_helpers.dart';
import 'package:smarttaxi_app/features/shared/models.dart';
import 'package:smarttaxi_app/l10n/app_localizations.dart';

final _l10n = lookupAppLocalizations(const Locale('ru'));

OrderSummary _driverOrder(String status,
        {String id = 'ride-1', String? driverId = 'driver-1'}) =>
    OrderSummary(
      id: id,
      status: status,
      pickup: 'улица Абая, 1',
      dropoff: 'улица Жамбыла, 2',
      driverId: driverId,
    );

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
  group('driver order and route lifecycle', () {
    test('a successful cancellation releases the reopened order', () {
      // This is POST /orders/:id/cancel's real response contract: dispatch
      // continues for the rider, but the cancelling driver has no assignment.
      final reopened = _driverOrder('SEARCHING_DRIVER', driverId: null);
      expect(driverOrderReleasesAssignment(reopened), isTrue);
      expect(
        driverOrderReleasesAssignment(_driverOrder('NEW', driverId: null)),
        isTrue,
      );
      expect(driverOrderReleasesAssignment(_driverOrder('NEW')), isFalse);
    });

    test('cancellation releases the driver while settlement stays available',
        () {
      for (final status in [
        'CANCELLED',
        'CANCELLED_BY_DRIVER',
        'CANCELLED_BY_CLIENT',
        'CANCELLED_BY_OPERATOR',
        'NO_SHOW',
      ]) {
        expect(driverOrderReleasesAssignment(_driverOrder(status)), isTrue,
            reason: status);
      }
      for (final status in [
        'TRIP_COMPLETED',
        'PAYMENT_PENDING',
        'PAID',
        'RATED',
        'COMPLETED',
      ]) {
        expect(driverOrderReleasesAssignment(_driverOrder(status)), isFalse,
            reason: status);
      }
    });

    test('legacy route source statuses keep their established driving leg', () {
      expect(driverRoutePhaseForStatus('NEW'), 'to_pickup');
      expect(driverRoutePhaseForStatus('DRIVER_ASSIGNED'), 'to_pickup');
      expect(driverRoutePhaseForStatus('IN_PROGRESS'), 'to_dropoff');
      expect(driverRoutePhaseForStatus('SEARCHING_DRIVER'), isNull);
      expect(driverRoutePhaseForStatus('PAYMENT_PENDING'), isNull);
    });

    test('start trip invalidates the pickup leg before any GPS update', () {
      final waiting = _driverOrder('WAITING_CLIENT');
      final started = _driverOrder('TRIP_STARTED');
      expect(driverRouteTargetChanged(waiting, started), isTrue);
      expect(driverRoutePhaseForStatus(started.status), 'to_dropoff');
      expect(
        driverRouteRequestMatches(
          activeOrder: started,
          orderId: waiting.id,
          phase: 'to_pickup',
        ),
        isFalse,
      );
    });

    test('same-leg updates retain the route but another order invalidates it',
        () {
      expect(
        driverRouteTargetChanged(
            _driverOrder('DRIVER_FOUND'), _driverOrder('DRIVER_ARRIVED')),
        isFalse,
      );
      expect(
        driverRouteTargetChanged(_driverOrder('DRIVER_FOUND'),
            _driverOrder('DRIVER_FOUND', id: 'ride-2')),
        isTrue,
      );
    });

    test('completion and dismissal invalidate outstanding route responses', () {
      final driving = _driverOrder('TRIP_STARTED');
      final completed = _driverOrder('TRIP_COMPLETED');
      expect(driverRouteTargetChanged(driving, completed), isTrue);
      expect(driverRouteTargetChanged(driving, null), isTrue);
      for (final active in [
        null,
        completed,
        _driverOrder('SEARCHING_DRIVER', driverId: null),
        _driverOrder('TRIP_STARTED', id: 'ride-2'),
      ]) {
        expect(
          driverRouteRequestMatches(
              activeOrder: active, orderId: driving.id, phase: 'to_dropoff'),
          isFalse,
        );
      }
      expect(
        driverRouteRequestMatches(
            activeOrder: driving, orderId: driving.id, phase: 'to_dropoff'),
        isTrue,
      );
    });
  });

  group('readableError', () {
    test('reads the backend error code from the Dio response body', () {
      // DioException.toString() never includes the response body (dio's
      // defaultDioExceptionReadableStringBuilder only describes the status
      // code generically), so a naive error.toString().contains(code) check
      // never matches a real backend rejection — every mapped message in
      // readableError() silently fell through to the generic fallback.
      expect(
        readableError(_l10n, _badResponse('DRIVER_LOCATION_OUTSIDE_REGION')),
        'Геолокация вне рабочего региона',
      );
      expect(
        readableError(_l10n, _badResponse('DRIVER_REGION_NOT_APPROVED')),
        'Вы не одобрены для этого региона',
      );
    });

    test('falls back to the generic message for an unmapped code', () {
      expect(
        readableError(_l10n, _badResponse('SOME_NEW_BACKEND_CODE')),
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
        readableError(_l10n, error),
        'Сервер недоступен. Проверьте подключение.',
      );
    });

    test('handles a non-Dio error without throwing', () {
      expect(readableError(_l10n, Exception('boom')), 'Не удалось выполнить запрос');
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
      expect(maneuverLabelAndIcon(_l10n, 'turn', 'left').$1, 'Поворот налево');
      expect(maneuverLabelAndIcon(_l10n, 'turn', 'right').$1, 'Поворот направо');
      expect(maneuverLabelAndIcon(_l10n, 'turn', 'slight left').$1,
          'Держитесь левее');
      expect(maneuverLabelAndIcon(_l10n, 'roundabout', 'right').$1,
          'Круговое движение');
      expect(
          maneuverLabelAndIcon(_l10n, 'arrive', null).$1, 'Вы почти на месте');
      // OSRM's 'continue' type (confirmed live: a Shymkent route returned
      // "continue"/"right" for a bend that keeps the same street name) used
      // to silently fall through to the generic default, dropping the
      // direction it actually carries.
      expect(maneuverLabelAndIcon(_l10n, 'continue', 'right').$1,
          'Поворот направо');
    });

    test('includes the roundabout exit number when OSRM provides one', () {
      expect(maneuverLabelAndIcon(_l10n, 'roundabout', null, exit: 2).$1,
          'Круговое движение, 2-й съезд');
      expect(maneuverLabelAndIcon(_l10n, 'roundabout', null).$1,
          'Круговое движение');
    });

    test('falls back to a generic label for an unrecognized type', () {
      expect(maneuverLabelAndIcon(_l10n, 'notification', null).$1,
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
