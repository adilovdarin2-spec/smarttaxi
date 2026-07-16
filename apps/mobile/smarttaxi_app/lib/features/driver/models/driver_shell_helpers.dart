import '../../shared/models.dart';

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
  };
  for (final entry in map.entries) {
    if (message.contains(entry.key)) return entry.value;
  }
  return 'Не удалось выполнить запрос';
}
