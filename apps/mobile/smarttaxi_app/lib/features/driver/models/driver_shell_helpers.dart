import 'package:dio/dio.dart';
import 'package:flutter/material.dart';

import '../../../l10n/app_localizations.dart';
import '../../shared/models.dart';

/// Legacy source statuses remain supported alongside the current lifecycle.
String? driverRoutePhaseForStatus(String? status) {
  const toPickup = {
    'DRIVER_FOUND',
    'DRIVER_GOING_TO_CLIENT',
    'DRIVER_ASSIGNED',
    'DRIVER_ARRIVED',
    'WAITING_CLIENT',
    'NEW',
  };
  const toDropoff = {'TRIP_STARTED', 'IN_PROGRESS'};
  if (toDropoff.contains(status)) return 'to_dropoff';
  if (toPickup.contains(status)) return 'to_pickup';
  return null;
}

/// Reopening for dispatch releases this driver just as a terminal cancellation
/// does. Completed/unpaid orders still belong on the settlement screen.
bool driverOrderReleasesAssignment(OrderSummary order) =>
    (order.isOpen && order.driverId == null) ||
    const {
      'CANCELLED',
      'CANCELLED_BY_DRIVER',
      'CANCELLED_BY_CLIENT',
      'CANCELLED_BY_OPERATOR',
      'NO_SHOW',
    }.contains(order.status);

bool driverRouteTargetChanged(OrderSummary? previous, OrderSummary? next) =>
    previous?.id != next?.id ||
    driverRoutePhaseForStatus(previous?.status) !=
        driverRoutePhaseForStatus(next?.status);

/// A sequence number alone cannot reject a response after cancellation or a
/// leg change when no replacement request has been issued yet.
bool driverRouteRequestMatches({
  required OrderSummary? activeOrder,
  required String orderId,
  required String phase,
}) =>
    activeOrder?.id == orderId &&
    !driverOrderReleasesAssignment(activeOrder!) &&
    driverRoutePhaseForStatus(activeOrder.status) == phase;

// OSRM's maneuver vocabulary (routing.service.js requests steps=true and
// passes maneuver.type/modifier through as-is — see that file's parseSteps)
// mapped to a localized label + icon for the navigator's turn banner. Kept
// separate from driver_shell.dart so it's unit-testable without a widget
// harness, same reasoning as readableError/apiErrorCode above.
(String, IconData) maneuverLabelAndIcon(
    AppLocalizations l10n, String type, String? modifier,
    {int? exit}) {
  switch (type) {
    case 'turn':
    case 'new name':
    case 'end of road':
    case 'fork':
    // OSRM's 'continue' means the road bears in a direction without a real
    // intersection choice (e.g. a curving street keeping the same name) —
    // same modifier vocabulary as 'turn', confirmed live (a Shymkent route
    // returned "continue"/"right" for a bend in улица Абдыразакова).
    // Previously fell through to the generic default below, silently
    // dropping the direction it actually carries.
    case 'continue':
      switch (modifier) {
        case 'left':
          return (l10n.driverManeuverTurnLeft, Icons.turn_left_rounded);
        case 'right':
          return (l10n.driverManeuverTurnRight, Icons.turn_right_rounded);
        case 'slight left':
          return (l10n.driverManeuverSlightLeft, Icons.turn_slight_left_rounded);
        case 'slight right':
          return (l10n.driverManeuverSlightRight, Icons.turn_slight_right_rounded);
        case 'sharp left':
          return (l10n.driverManeuverSharpLeft, Icons.turn_left_rounded);
        case 'sharp right':
          return (l10n.driverManeuverSharpRight, Icons.turn_right_rounded);
        case 'uturn':
          return (l10n.driverManeuverUturn, Icons.u_turn_left_rounded);
        default:
          return (l10n.driverManeuverStraight, Icons.straight_rounded);
      }
    case 'merge':
      return modifier == 'left'
          ? (l10n.driverManeuverMergeLeft, Icons.merge_rounded)
          : (l10n.driverManeuverMergeRight, Icons.merge_rounded);
    case 'on ramp':
      return (l10n.driverManeuverOnRamp, Icons.moving_rounded);
    case 'off ramp':
      return (l10n.driverManeuverOffRamp, Icons.moving_rounded);
    case 'roundabout':
    case 'rotary':
    case 'roundabout turn':
      // OSRM's `exit` on a roundabout maneuver counts exits from 1 — telling
      // a driver just "circular motion" without which exit to take isn't
      // enough to actually navigate a multi-exit roundabout correctly.
      return exit != null
          ? (l10n.driverManeuverRoundaboutWithExit(exit),
              Icons.roundabout_left_rounded)
          : (l10n.driverManeuverRoundabout, Icons.roundabout_left_rounded);
    case 'exit roundabout':
    case 'exit rotary':
      return (l10n.driverManeuverExitRoundabout, Icons.roundabout_right_rounded);
    case 'arrive':
      return (l10n.driverManeuverArrive, Icons.flag_rounded);
    default:
      return (l10n.driverManeuverFollowRoute, Icons.straight_rounded);
  }
}

String formatTripHistoryDate(AppLocalizations l10n, DateTime? date) {
  if (date == null) return '';
  final months = [
    l10n.passengerMonthJan,
    l10n.passengerMonthFeb,
    l10n.passengerMonthMar,
    l10n.passengerMonthApr,
    l10n.passengerMonthMay,
    l10n.passengerMonthJun,
    l10n.passengerMonthJul,
    l10n.passengerMonthAug,
    l10n.passengerMonthSep,
    l10n.passengerMonthOct,
    l10n.passengerMonthNov,
    l10n.passengerMonthDec,
  ];
  final local = date.toLocal();
  final day = local.day.toString().padLeft(2, '0');
  final month = months[local.month - 1];
  final hour = local.hour.toString().padLeft(2, '0');
  final minute = local.minute.toString().padLeft(2, '0');
  return '$day $month, $hour:$minute';
}

List<OrderSummary> mergeOrder(List<OrderSummary> orders, OrderSummary next) {
  final updated = [...orders];
  final index = updated.indexWhere((order) => order.id == next.id);
  if (index >= 0) {
    updated[index] = _mergeOrderDetails(updated[index], next);
  } else {
    updated.insert(0, next);
  }
  return updated;
}

OrderSummary _mergeOrderDetails(OrderSummary previous, OrderSummary next) {
  return OrderSummary(
    id: next.id,
    status: next.status,
    pickup: next.pickup == 'Точка посадки' ? previous.pickup : next.pickup,
    dropoff:
        next.dropoff == 'Точка назначения' ? previous.dropoff : next.dropoff,
    price: next.price ?? previous.price,
    distanceKm: next.distanceKm ?? previous.distanceKm,
    durationMin: next.durationMin ?? previous.durationMin,
    tariff: next.tariff ?? previous.tariff,
    driverId: next.driverId ?? previous.driverId,
    pickupCoordinate: next.pickupCoordinate ?? previous.pickupCoordinate,
    dropoffCoordinate: next.dropoffCoordinate ?? previous.dropoffCoordinate,
  );
}

String formatDriverMoney(int value) {
  final text = value.toString().replaceAllMapped(
        RegExp(r'\B(?=(\d{3})+(?!\d))'),
        (_) => ' ',
      );
  return '$text ₸';
}

String driverPaymentLabel(AppLocalizations l10n, String? method) {
  switch ((method ?? '').toUpperCase()) {
    case 'KASPI':
      return l10n.paymentKaspi;
    case 'CARD':
      return l10n.paymentCard;
    case 'CASHBACK':
      return l10n.driverPaymentCashback;
    case 'MIXED':
      return l10n.driverPaymentMixed;
    case 'CASH':
    default:
      return l10n.paymentCash;
  }
}

String? routeMeta(AppLocalizations l10n, OrderSummary order) {
  final parts = <String>[];
  if (order.distanceKm != null) {
    parts.add('${order.distanceKm!.toStringAsFixed(1)} км');
  }
  if (order.durationMin != null) parts.add('${order.durationMin!.round()} мин');
  if (parts.isEmpty) return null;
  return l10n.driverRouteMetaLabel(parts.join(' · '));
}

// Distance/ETA from the driver's actual current position to whichever leg
// is active right now (pickup or dropoff) — recalculated by the backend via
// OSRM as the driver moves. Prefer this over routeMeta() during an active
// trip: routeMeta() is the static pickup-to-dropoff estimate captured once
// at order creation, so it neither updates as the driver drives nor
// reflects a reroute after the driver deviates from the drawn path.
String? liveRouteMeta(
  AppLocalizations l10n,
  RoutePreview? route, {
  double? liveDistanceMeters,
  double? liveDurationSeconds,
}) {
  if (route == null) return null;
  final distanceKm = (liveDistanceMeters ?? route.distanceMeters) / 1000;
  final minutes = ((liveDurationSeconds ?? route.durationSeconds) / 60).round();
  final label = route.isToDropoff
      ? l10n.driverPickupMetaToDropoff
      : l10n.driverPickupMetaToPickup;
  final text =
      l10n.driverPickupMetaText(label, distanceKm.toStringAsFixed(1), minutes);
  // route.isFallback means OSRM was unreachable and the backend drew a
  // straight line between the two points instead of a real road route
  // (routing.service.js's straightLineRouteFallback) — distance/ETA are a
  // rough guess, not what the road actually measures. This used to render
  // identically to a real route with no way to tell the difference.
  return route.isFallback
      ? '$text · ${l10n.driverRouteFallbackNotice}'
      : text;
}

String statusLabel(AppLocalizations l10n, String status) {
  return {
        'NEW': l10n.driverOrderStatusNew,
        'SEARCHING_DRIVER': l10n.statusStepSearching,
        'DRIVER_FOUND': l10n.driverOrderStatusAccepted,
        'DRIVER_GOING_TO_CLIENT': l10n.driverOrderStatusGoingToClient,
        'DRIVER_ASSIGNED': l10n.driverOrderStatusAccepted,
        'DRIVER_ARRIVED': l10n.driverActionArrived,
        'WAITING_CLIENT': l10n.driverOrderStatusWaiting,
        'TRIP_STARTED': l10n.statusStepInTransit,
        'IN_PROGRESS': l10n.statusStepInTransit,
        'TRIP_COMPLETED': l10n.driverOrderStatusCompleted,
        'PAYMENT_PENDING': l10n.driverOrderStatusPaymentPending,
        'PAID': l10n.statusLabelPaid,
        'RATED': l10n.driverOrderStatusRated,
        'NO_SHOW': l10n.driverTripNoShowButton,
        'CANCELLED_BY_DRIVER': l10n.driverOrderStatusCancelledByDriver,
        'CANCELLED_BY_CLIENT': l10n.driverOrderStatusCancelledByClient,
        'CANCELLED_BY_OPERATOR': l10n.driverOrderStatusCancelledByOperator,
        'COMPLETED': l10n.driverOrderStatusCompleted,
        'CANCELLED': l10n.driverOrderStatusCancelled,
      }[status] ??
      status;
}

// DioException.toString() never includes the response body — for a
// badResponse it's just a generic "status code X means ..." blurb (see
// dio's defaultDioExceptionReadableStringBuilder) — so matching the
// backend's AppError code (sent as response.data['error'] on every 4xx/5xx,
// see apps/api/src/common/errors.js) against error.toString() never actually
// matches for any real backend rejection. Read it from the response body
// directly. Shared by readableError() below and by any call site that needs
// to branch on the exact code (e.g. driver_shell.dart's go-online-rejected-
// for-approval-reasons check) instead of just the display string.
String? apiErrorCode(Object error) {
  final data = error is DioException ? error.response?.data : null;
  return data is Map ? data['error']?.toString() : null;
}

String readableError(AppLocalizations l10n, Object error) {
  final message = error.toString();
  if (message.contains('SocketException') ||
      message.contains('Connection') ||
      message.contains('connection') ||
      message.contains('timed out')) {
    return l10n.errorServerUnavailable;
  }
  final map = {
    'DRIVER_REGION_NOT_SELECTED': l10n.driverErrorRegionNotSelected,
    'DRIVER_REGION_INACTIVE': l10n.driverErrorRegionInactive,
    'DRIVER_REGION_NOT_APPROVED': l10n.driverErrorRegionNotApproved,
    'DRIVER_REGION_BLOCKED': l10n.driverErrorRegionBlocked,
    'DRIVER_BLOCKED': l10n.driverErrorDriverBlocked,
    'DRIVER_DOCUMENTS_NOT_APPROVED': l10n.driverErrorDocumentsNotApproved,
    'DRIVER_HAS_ACTIVE_ORDER': l10n.driverErrorHasActiveOrder,
    'ORDER_ALREADY_ACCEPTED': l10n.driverErrorOrderAlreadyAccepted,
    'INVALID_STATUS_TRANSITION': l10n.driverErrorInvalidStatusTransition,
    'FORBIDDEN_ORDER': l10n.driverErrorForbiddenOrder,
    'ORDER_REGION_MISMATCH': l10n.driverErrorOrderRegionMismatch,
    'ORDER_NOT_FOUND': l10n.driverErrorOrderNotFound,
    'DRIVER_DEBT_LIMIT': l10n.driverErrorDebtLimit,
    'DRIVER_OFFLINE': l10n.driverGoOnlineRequiredError,
    'DRIVER_LOCATION_OUTSIDE_REGION': l10n.driverErrorLocationOutsideRegion,
    'ROUTE_UNAVAILABLE': l10n.errorRouteUnavailable,
    'DRIVER_LOCATION_UNAVAILABLE': l10n.driverErrorLocationUnavailable,
    // Rating requires the order to reach PAID first -- the driver confirms
    // that themselves via the "Оплата получена" step on the trip-completion
    // card (DriverTripCompletionCard, calls POST /orders/:id/mark-paid).
    'ORDER_NOT_COMPLETED': l10n.driverErrorOrderNotCompleted,
    'ORDER_ALREADY_RATED': l10n.driverErrorOrderAlreadyRated,
  };
  final code = apiErrorCode(error);
  if (code != null && map.containsKey(code)) return map[code]!;
  for (final entry in map.entries) {
    if (message.contains(entry.key)) return entry.value;
  }
  return l10n.errorGenericRequestFailed;
}
