import 'package:dio/dio.dart';
import 'package:flutter/material.dart';

import '../../shared/models.dart';

// OSRM's maneuver vocabulary (routing.service.js requests steps=true and
// passes maneuver.type/modifier through as-is — see that file's parseSteps)
// mapped to a Russian label + icon for the navigator's turn banner. Kept
// separate from driver_shell.dart so it's unit-testable without a widget
// harness, same reasoning as readableError/apiErrorCode above.
(String, IconData) maneuverLabelAndIcon(String type, String? modifier,
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
          return ('Поворот налево', Icons.turn_left_rounded);
        case 'right':
          return ('Поворот направо', Icons.turn_right_rounded);
        case 'slight left':
          return ('Держитесь левее', Icons.turn_slight_left_rounded);
        case 'slight right':
          return ('Держитесь правее', Icons.turn_slight_right_rounded);
        case 'sharp left':
          return ('Крутой поворот налево', Icons.turn_left_rounded);
        case 'sharp right':
          return ('Крутой поворот направо', Icons.turn_right_rounded);
        case 'uturn':
          return ('Разворот', Icons.u_turn_left_rounded);
        default:
          return ('Двигайтесь прямо', Icons.straight_rounded);
      }
    case 'merge':
      return modifier == 'left'
          ? ('Перестройтесь влево', Icons.merge_rounded)
          : ('Перестройтесь вправо', Icons.merge_rounded);
    case 'on ramp':
      return ('Съезд на трассу', Icons.moving_rounded);
    case 'off ramp':
      return ('Съезд с трассы', Icons.moving_rounded);
    case 'roundabout':
    case 'rotary':
    case 'roundabout turn':
      // OSRM's `exit` on a roundabout maneuver counts exits from 1 — telling
      // a driver just "circular motion" without which exit to take isn't
      // enough to actually navigate a multi-exit roundabout correctly.
      // Russian ordinal abbreviations (N-й) don't need per-number suffix
      // logic the way English 1st/2nd/3rd does.
      return exit != null
          ? ('Круговое движение, $exit-й съезд', Icons.roundabout_left_rounded)
          : ('Круговое движение', Icons.roundabout_left_rounded);
    case 'exit roundabout':
    case 'exit rotary':
      return ('Съезд с кругового движения', Icons.roundabout_right_rounded);
    case 'arrive':
      return ('Вы почти на месте', Icons.flag_rounded);
    default:
      return ('Двигайтесь по маршруту', Icons.straight_rounded);
  }
}

String formatTripHistoryDate(DateTime? date) {
  if (date == null) return '';
  const months = [
    'янв',
    'фев',
    'мар',
    'апр',
    'мая',
    'июн',
    'июл',
    'авг',
    'сен',
    'окт',
    'ноя',
    'дек',
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

String driverPaymentLabel(String? method) {
  switch ((method ?? '').toUpperCase()) {
    case 'KASPI':
      return 'Kaspi';
    case 'CARD':
      return 'Карта';
    case 'CASHBACK':
      return 'Бонусы';
    case 'MIXED':
      return 'Смешанная';
    case 'CASH':
    default:
      return 'Наличные';
  }
}

String? routeMeta(OrderSummary order) {
  final parts = <String>[];
  if (order.distanceKm != null) {
    parts.add('${order.distanceKm!.toStringAsFixed(1)} км');
  }
  if (order.durationMin != null) parts.add('${order.durationMin!.round()} мин');
  if (parts.isEmpty) return null;
  return 'Маршрут: ${parts.join(' · ')}';
}

// Distance/ETA from the driver's actual current position to whichever leg
// is active right now (pickup or dropoff) — recalculated by the backend via
// OSRM as the driver moves. Prefer this over routeMeta() during an active
// trip: routeMeta() is the static pickup-to-dropoff estimate captured once
// at order creation, so it neither updates as the driver drives nor
// reflects a reroute after the driver deviates from the drawn path.
String? liveRouteMeta(RoutePreview? route) {
  if (route == null) return null;
  final distanceKm = route.distanceMeters / 1000;
  final minutes = (route.durationSeconds / 60).round();
  final label = route.isToDropoff ? 'До точки назначения' : 'До точки посадки';
  return '$label: ${distanceKm.toStringAsFixed(1)} км · $minutes мин';
}

String statusLabel(String status) {
  return const {
        'NEW': 'Новый',
        'SEARCHING_DRIVER': 'Поиск',
        'DRIVER_FOUND': 'Принят',
        'DRIVER_GOING_TO_CLIENT': 'Едет к клиенту',
        'DRIVER_ASSIGNED': 'Принят',
        'DRIVER_ARRIVED': 'Прибыл',
        'WAITING_CLIENT': 'Ожидание',
        'TRIP_STARTED': 'В пути',
        'IN_PROGRESS': 'В пути',
        'TRIP_COMPLETED': 'Завершено',
        'PAYMENT_PENDING': 'Ожидает оплату',
        'PAID': 'Оплачено',
        'RATED': 'Оценено',
        'NO_SHOW': 'Клиент не вышел',
        'CANCELLED_BY_DRIVER': 'Отменён водителем',
        'CANCELLED_BY_CLIENT': 'Отменён клиентом',
        'CANCELLED_BY_OPERATOR': 'Отменён оператором',
        'COMPLETED': 'Завершено',
        'CANCELLED': 'Отменён',
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

String readableError(Object error) {
  final message = error.toString();
  if (message.contains('SocketException') ||
      message.contains('Connection') ||
      message.contains('connection') ||
      message.contains('timed out')) {
    return 'Сервер недоступен. Проверьте подключение.';
  }
  const map = {
    'DRIVER_REGION_NOT_SELECTED': 'Выберите рабочий регион',
    'DRIVER_REGION_INACTIVE': 'Регион временно отключён',
    'DRIVER_REGION_NOT_APPROVED': 'Вы не одобрены для этого региона',
    'DRIVER_REGION_BLOCKED': 'Работа в этом регионе заблокирована',
    'DRIVER_BLOCKED': 'Водитель заблокирован',
    'DRIVER_DOCUMENTS_NOT_APPROVED': 'Сервер ещё требует проверку документов — обратитесь в поддержку',
    'DRIVER_HAS_ACTIVE_ORDER': 'У вас уже есть активный заказ',
    'ORDER_ALREADY_ACCEPTED': 'Заказ уже принят другим водителем',
    'INVALID_STATUS_TRANSITION': 'Этот шаг уже недоступен для заказа',
    'FORBIDDEN_ORDER': 'Этот заказ назначен другому водителю',
    'ORDER_REGION_MISMATCH': 'Заказ вне вашего рабочего региона',
    'ORDER_NOT_FOUND': 'Заказ не найден',
    'DRIVER_DEBT_LIMIT': 'Превышен лимит долга. Свяжитесь с оператором',
    'DRIVER_OFFLINE': 'Выйдите на линию, чтобы принимать заказы.',
    'DRIVER_LOCATION_OUTSIDE_REGION': 'Геолокация вне рабочего региона',
    'ROUTE_UNAVAILABLE': 'Маршрут временно недоступен',
    'DRIVER_LOCATION_UNAVAILABLE': 'Ожидаем геолокацию водителя',
    // Rating requires the order to reach PAID first. For CASH/KASPI trips
    // (the only working payment methods today) that transition is only
    // ever made by an operator via POST /orders/:id/mark-paid — DRIVER is
    // not in that route's allowed roles, and neither app ever calls it
    // automatically. So this isn't a "wait a moment" race the driver can
    // just retry past; naming who it's actually waiting on is more honest
    // than implying a short delay will fix it.
    'ORDER_NOT_COMPLETED': 'Оплата поездки ещё не подтверждена оператором.',
    'ORDER_ALREADY_RATED': 'Вы уже оценили этого пассажира',
  };
  final code = apiErrorCode(error);
  if (code != null && map.containsKey(code)) return map[code]!;
  for (final entry in map.entries) {
    if (message.contains(entry.key)) return entry.value;
  }
  return 'Не удалось выполнить запрос';
}
